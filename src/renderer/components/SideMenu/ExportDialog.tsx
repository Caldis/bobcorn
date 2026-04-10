// Electron API (via preload contextBridge)
const { electronAPI } = window;

import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, Button, Checkbox, CheckboxGroup, Progress } from '../ui';
import { message } from '../ui/toast';
import { platform } from '../../utils/tools';
import {
  svgFontGenerator,
  ttfFontGenerator,
  woffFontGenerator,
  woff2FontGenerator,
  eotFontGenerator,
} from '../../utils/generators/iconfontGenerator';
import {
  demoHTMLGenerator,
  iconfontCSSGenerator,
  iconfontSymbolGenerator,
} from '../../utils/generators/demopageGenerator';
import { zipSync } from 'fflate';
import { cn } from '../../lib/utils';
import { analyticsTrack } from '../../store';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.set-name, project.set-prefix, export.font, export.svg
import db from '../../database';
import type { ExportGroupOption } from './types';

interface ExportDialogProps {
  visible: boolean;
  onClose: () => void;
}

/** Wiki integration */
const WIKI_BASE = 'https://bobcorn.caldis.me/wiki/';
const WIKI_LANG_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  'pt-BR': 'pt-BR',
  it: 'it',
  nl: 'nl',
  ru: 'ru',
  tr: 'tr',
  ar: 'ar',
  th: 'th',
  vi: 'vi',
  id: 'id',
};

/** Format wiki slugs + i18n summary keys for hover knowledge cards */
const FORMAT_INFO: Record<string, { wiki: string; summaryKey: string }> = {
  svg: { wiki: 'svg-font', summaryKey: 'export.fmt.svg' },
  ttf: { wiki: 'ttf', summaryKey: 'export.fmt.ttf' },
  woff2: { wiki: 'woff2', summaryKey: 'export.fmt.woff2' },
  css: { wiki: 'css-font-face', summaryKey: 'export.fmt.css' },
  woff: { wiki: 'woff', summaryKey: 'export.fmt.woff' },
  eot: { wiki: 'eot', summaryKey: 'export.fmt.eot' },
  js: { wiki: 'svg-symbol', summaryKey: 'export.fmt.js' },
};

function ExportDialog({ visible, onClose }: ExportDialogProps) {
  const { t, i18n } = useTranslation();

  /** Open a wiki page in the default browser, localized to current app language */
  const openWikiPage = (slug: string) => {
    const lang = WIKI_LANG_MAP[i18n.language] || 'en';
    electronAPI.openExternal(`${WIKI_BASE}${lang}/${slug}.html`);
  };

  /** Hovered format — fixed-position popover card */
  const [hoveredFormat, setHoveredFormat] = useState<string | null>(null);
  const [cardPos, setCardPos] = useState<{ x: number; y: number; w: number }>({
    x: 0,
    y: 0,
    w: 300,
  });
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onFormatHover = (key: string, el: HTMLElement) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const rect = el.getBoundingClientRect();
    setCardPos({ x: rect.left, y: rect.bottom + 6, w: Math.max(280, rect.width) });
    setHoveredFormat(key);
  };
  const onFormatLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => setHoveredFormat(null), 150);
  };
  const onCardEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };
  const onCardLeave = () => {
    setHoveredFormat(null);
  };

  // 导出进度
  const [exportPhase, setExportPhase] = useState<'config' | 'exporting' | 'done' | 'error'>(
    'config'
  );
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const exportLogsEndRef = useRef<HTMLDivElement>(null);
  const [exportedDirPath, setExportedDirPath] = useState<string>('');
  const [exportedProjectName, setExportedProjectName] = useState<string>('');

  // 导出目录选择
  const [exportParentDir, setExportParentDir] = useState<string>('');

  // 分组选择
  const [exportGroupFullList, setExportGroupFullList] = useState<ExportGroupOption[]>([]);
  const [exportGroupSelected, setExportGroupSelected] = useState<string[]>([]);
  const [exportGroupCheckAll, setExportGroupCheckAll] = useState<boolean>(true);
  const [exportGroupIndeterminate, setExportGroupIndeterminate] = useState<boolean>(false);
  const [exportGroupModelVisible, setExportGroupModelVisible] = useState<boolean>(true);

  // Format selection
  const [selectedFormats, setSelectedFormats] = useState({
    svg: true,
    ttf: true,
    woff2: true,
    css: true, // companion, default ON
    woff: true,
    eot: true,
    js: true,
    html: true, // optional, default ON
    icp: false, // optional, default OFF
  });
  const [zipEnabled, setZipEnabled] = useState(false);

  // Preview panel
  const [previewVisible, setPreviewVisible] = useState(false);

  // 导出统计缓存 (避免渲染中反复查 DB)
  const [exportTotalIcons, setExportTotalIcons] = useState<number>(0);
  const [exportTotalGroups, setExportTotalGroups] = useState<number>(0);
  const [exportSelectedIconCount, setExportSelectedIconCount] = useState<number>(0);
  const groupIconCountsRef = useRef<Record<string, number>>({});

  // 当对话框打开时初始化分组列表
  const initGroupList = () => {
    const groups = db.getGroupList();
    const totalIcons = db.getIconCount();
    const groupList: ExportGroupOption[] = groups.map((group: any) => ({
      label: group.groupName,
      value: group.id,
    }));
    setExportGroupFullList(groupList);
    setExportGroupSelected(groupList.map((group) => group.value));
    setExportGroupIndeterminate(false);
    setExportGroupCheckAll(true);
    // 预缓存每个分组的图标计数，避免 checkbox 变化时查 DB
    const counts: Record<string, number> = {};
    groups.forEach((g: any) => {
      counts[g.id] = db.getIconCountFromGroup(g.id);
    });
    groupIconCountsRef.current = counts;
    setExportTotalIcons(totalIcons);
    setExportTotalGroups(groups.length);
    setExportSelectedIconCount(totalIcons);
  };

  // Generate preview HTML — 30 sample icons with inline SVG sprite (no font needed)
  const previewHTML = useMemo(() => {
    if (!previewVisible || !visible) return '';
    try {
      const groups = db.getGroupList();
      groups.push({
        id: 'resource-uncategorized',
        groupName: t('nav.ungrouped'),
        groupOrder: -1,
        groupColor: '',
      });
      const allIcons = db.getIconList();
      const sampleIcons = allIcons.slice(0, 30);
      // Generate inline SVG symbol sprite so icons render without the font
      const inlineSprite = iconfontSymbolGenerator(sampleIcons);
      return demoHTMLGenerator(groups, sampleIcons, undefined, {
        hasSymbol: true,
        selectedFormats,
        inlineSymbolSprite: inlineSprite,
      });
    } catch {
      return '';
    }
  }, [previewVisible, visible, selectedFormats.js]);

  // 当 visible 变为 true 时初始化
  const prevVisibleRef = useRef(false);
  if (visible && !prevVisibleRef.current) {
    initGroupList();
    // 默认导出到桌面
    setExportParentDir(electronAPI.getAppPath('desktop'));
  }
  prevVisibleRef.current = visible;

  // 选择导出目录
  const handleBrowseDir = async () => {
    const result = await electronAPI.showOpenDialog({
      title: t('export.selectLocationTitle'),
      defaultPath: exportParentDir || electronAPI.getAppPath('desktop'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result.canceled && result.filePaths?.length) {
      setExportParentDir(result.filePaths[0]);
    }
  };

  const exportTargetDir = exportParentDir
    ? `${exportParentDir}${electronAPI.platform === 'win32' ? '\\' : '/'}${db.getProjectName()}`
    : '';

  const addExportLog = (msg: string) => {
    setExportLogs((prev) => [...prev, msg]);
    setTimeout(() => exportLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleEnsureExportIconfonts = async () => {
    if (!exportParentDir) {
      message.warning(t('export.selectLocationWarning'));
      return;
    }

    const allGroupSelected =
      exportGroupSelected.length === 0 || exportGroupFullList.length === exportGroupSelected.length;
    const allIcons = db.getIconList();
    const icons = allGroupSelected
      ? allIcons
      : allIcons.filter((icon: any) => exportGroupSelected.includes(icon.iconGroup));
    if (!icons.length) {
      message.warning(t('export.noIconsWarning'));
      return;
    }

    const projectName = db.getProjectName();
    const dirPath = `${exportParentDir}${electronAPI.platform === 'win32' ? '\\' : '/'}${projectName}`;

    // 切换到导出进度视图
    setExportPhase('exporting');
    setExportProgress(0);
    setExportLogs([]);
    setExportedDirPath(dirPath);
    setExportedProjectName(projectName);

    // 使用 setTimeout 让每步有机会更新 UI
    const step = (progress: number, log: string) =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          setExportProgress(progress);
          addExportLog(log);
          resolve();
        }, 30)
      );

    try {
      // Calculate dynamic total steps for progress
      let totalSteps = 4; // css, svg, ttf, woff2 (always)
      if (selectedFormats.woff) totalSteps++;
      if (selectedFormats.eot) totalSteps++;
      if (selectedFormats.js) totalSteps++;
      if (selectedFormats.html) totalSteps++;
      if (selectedFormats.icp) totalSteps++;
      totalSteps += 1; // write step
      if (zipEnabled) totalSteps++;
      let completedSteps = 0;
      const nextPct = () => Math.min(98, Math.round((++completedSteps / totalSteps) * 98));

      await step(nextPct(), t('export.progress.preparing', { count: icons.length }));

      const groups = db.getGroupList();
      groups.push({
        id: 'resource-uncategorized',
        groupName: t('nav.ungrouped'),
        groupOrder: -1,
        groupColor: '',
      });

      await step(nextPct(), t('export.progress.css'));
      const cssData = iconfontCSSGenerator(icons, selectedFormats);

      let jsData: string | null = null;
      if (selectedFormats.js) {
        await step(nextPct(), t('export.progress.jsSymbol'));
        jsData = iconfontSymbolGenerator(icons);
      }

      await step(nextPct(), t('export.progress.svg', { count: icons.length }));
      const svgFont = await new Promise<string>((resolve, reject) => {
        svgFontGenerator(
          {
            icons,
            options: {
              fontName: projectName,
              normalize: true,
              fixedWidth: true,
              fontHeight: 1024,
              fontWeight: 400,
              centerHorizontally: true,
              round: 1000,
              log: () => {},
            },
          },
          (result: string) =>
            result ? resolve(result) : reject(new Error(t('export.progress.svgFailed'))),
          (processed: number, total: number) => {
            if (processed === total) {
              addExportLog(t('export.progress.svgDone', { count: total }));
            }
          }
        );
      });

      await step(nextPct(), t('export.progress.ttf'));
      const ttfFont = ttfFontGenerator({ svgFont });

      await step(nextPct(), t('export.progress.woff2'));
      const woff2Font = woff2FontGenerator({ ttfFont });

      let woffFont: any = null;
      if (selectedFormats.woff) {
        await step(nextPct(), t('export.progress.woff'));
        woffFont = woffFontGenerator({ ttfFont });
      }

      let eotFont: any = null;
      if (selectedFormats.eot) {
        await step(nextPct(), t('export.progress.eot'));
        eotFont = eotFontGenerator({ ttfFont });
      }

      let pageData: string | null = null;
      if (selectedFormats.html) {
        await step(nextPct(), t('export.progress.html'));
        const woff2Base64 = Buffer.from(woff2Font.buffer).toString('base64');
        pageData = demoHTMLGenerator(
          groups,
          icons.map((icon: any) => Object.assign({}, icon, { iconContent: '' })),
          woff2Base64,
          { hasSymbol: selectedFormats.js, selectedFormats }
        );
      }

      let projBuffer: Buffer | null = null;
      if (selectedFormats.icp) {
        await step(nextPct(), t('export.progress.icp'));
        const projData = await new Promise<any>((resolve) => db.exportProject(resolve));
        projBuffer = Buffer.from(projData);
      }

      await step(nextPct(), t('export.progress.writing'));
      if (!electronAPI.accessSync(dirPath)) {
        electronAPI.mkdirSync(dirPath);
      }

      const files: Array<{ name: string; data: string | Buffer }> = [];
      files.push({ name: `${projectName}.svg`, data: svgFont });
      files.push({ name: `${projectName}.ttf`, data: Buffer.from(ttfFont.buffer) });
      files.push({ name: `${projectName}.woff2`, data: Buffer.from(woff2Font.buffer) });
      files.push({ name: `${projectName}.css`, data: cssData });
      if (woffFont) files.push({ name: `${projectName}.woff`, data: Buffer.from(woffFont.buffer) });
      if (eotFont) files.push({ name: `${projectName}.eot`, data: Buffer.from(eotFont.buffer) });
      if (jsData) files.push({ name: `${projectName}.js`, data: jsData });
      if (pageData) files.push({ name: `${projectName}.html`, data: pageData });
      if (projBuffer) files.push({ name: `${projectName}.icp`, data: projBuffer });

      if (zipEnabled) {
        // ZIP-only mode: pack all files into a single .zip, no loose files
        await step(nextPct(), t('export.progress.zipping'));
        // zipSync imported at top level from 'fflate'
        const zipData: Record<string, Uint8Array> = {};
        for (const f of files) {
          zipData[f.name] =
            typeof f.data === 'string'
              ? new TextEncoder().encode(f.data)
              : new Uint8Array(f.data as Buffer);
        }
        const zipped = zipSync(zipData, { level: 6 });
        electronAPI.writeFileSync(`${dirPath}.zip`, Buffer.from(zipped));
        addExportLog(t('export.progress.writeZip', { name: projectName, count: files.length }));
      } else {
        // Directory mode: write individual files
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          addExportLog(t('export.progress.writeFile', { name: f.name }));
          electronAPI.writeFileSync(`${dirPath}/${f.name}`, f.data);
        }
      }

      await step(
        100,
        t('export.progress.success', { count: files.length, zip: zipEnabled ? ' (ZIP)' : '' })
      );
      setExportPhase('done');
      analyticsTrack('font.generate', {
        formats: Object.entries(selectedFormats)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(','),
        zip: zipEnabled,
      });
    } catch (err: any) {
      console.error(err);
      const errMsg =
        err === 'Checksum error in glyf' ? t('export.progress.checkOutline') : err.message || err;
      addExportLog(t('export.progress.failed', { error: errMsg }));
      setExportPhase('error');
    }
  };

  const handleCancel = () => {
    onClose();
    // 关闭后重置状态
    setTimeout(() => {
      setExportPhase('config');
      setExportProgress(0);
      setExportLogs([]);
      setExportParentDir('');
    }, 300);
  };

  const onTargetGroupCheckAllChange = (checked: boolean) => {
    const selected = checked ? exportGroupFullList.map((group) => group.value) : [];
    setExportGroupSelected(selected);
    setExportGroupIndeterminate(false);
    setExportGroupCheckAll(checked);
    setExportSelectedIconCount(checked ? exportTotalIcons : 0);
  };

  const onTargetGroupChange = (checkedValues: string[]) => {
    setExportGroupSelected(checkedValues);
    const isAll = checkedValues.length === exportGroupFullList.length;
    setExportGroupIndeterminate(!!checkedValues.length && !isAll);
    setExportGroupCheckAll(isAll);
    // 用预缓存的 per-group 计数，不再查 DB
    const counts = groupIconCountsRef.current;
    setExportSelectedIconCount(
      isAll ? exportTotalIcons : checkedValues.reduce((sum, id) => sum + (counts[id] || 0), 0)
    );
  };

  const dialogTitle =
    exportPhase === 'config'
      ? t('export.title')
      : exportPhase === 'done'
        ? t('export.done')
        : exportPhase === 'error'
          ? t('export.failed')
          : t('export.exporting');

  const dialogFooter =
    exportPhase === 'config' ? (
      <>
        <Button key="cancel" onClick={handleCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          key="export"
          type="primary"
          disabled={exportGroupSelected.length === 0}
          onClick={() => {
            if (exportGroupSelected.length === 0) {
              message.warning(t('export.noGroupWarning'));
              return;
            }
            handleEnsureExportIconfonts();
          }}
        >
          {t('export.exportBtn')}
        </Button>
      </>
    ) : exportPhase === 'done' || exportPhase === 'error' ? (
      <Button key="close" type="primary" onClick={handleCancel}>
        {t('common.close')}
      </Button>
    ) : null;

  return (
    <>
      <Dialog
        open={visible}
        onClose={handleCancel}
        title={dialogTitle}
        maskClosable={exportPhase === 'config' || exportPhase === 'done' || exportPhase === 'error'}
        closable={exportPhase !== 'exporting'}
        footer={dialogFooter}
      >
        {/* 配置阶段 */}
        {exportPhase === 'config' && (
          <div className="py-2">
            <p className="text-sm text-foreground-muted leading-relaxed mb-4">
              {t('export.description')}
            </p>

            {/* 分组选择 — 内联折叠 */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-2 bg-surface-muted cursor-pointer hover:bg-surface-accent transition-colors min-h-[36px]"
                onClick={() => setExportGroupModelVisible(!exportGroupModelVisible)}
              >
                <span className="text-sm font-medium text-foreground">{t('export.groups')}</span>
                <span className="text-xs text-foreground-muted">
                  {exportGroupCheckAll
                    ? t('export.groupsAll', { groups: exportTotalGroups, icons: exportTotalIcons })
                    : t('export.groupsPartial', {
                        groups: exportGroupSelected.length,
                        icons: exportSelectedIconCount,
                      })}
                </span>
              </div>
              {exportGroupModelVisible && (
                <div className="px-3 py-2 max-h-[200px] overflow-y-auto border-t border-border">
                  <div className="border-b border-border pb-1.5 mb-1.5">
                    <Checkbox
                      indeterminate={exportGroupIndeterminate}
                      onChange={onTargetGroupCheckAllChange}
                      checked={exportGroupCheckAll}
                    >
                      {t('export.selectAll')}
                    </Checkbox>
                  </div>
                  <CheckboxGroup
                    options={exportGroupFullList}
                    value={exportGroupSelected}
                    onChange={onTargetGroupChange}
                  />
                </div>
              )}
            </div>

            {/* 必选格式 */}
            {/* 必选字体格式 */}
            <div className="mt-3">
              <div className="text-xs text-foreground-muted mb-1.5">
                {t('export.requiredFormats')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['svg', 'ttf', 'woff2'] as const).map((key) => (
                  <span
                    key={key}
                    onMouseEnter={(e) => onFormatHover(key, e.currentTarget)}
                    onMouseLeave={onFormatLeave}
                    className={cn(
                      'px-2 py-0.5 rounded text-xs font-mono cursor-default transition-colors',
                      hoveredFormat === key
                        ? 'bg-accent/15 text-accent'
                        : 'bg-accent-subtle text-accent'
                    )}
                  >
                    {key.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            {/* 可选字体格式 */}
            <div className="mt-3">
              <div className="text-xs text-foreground-muted mb-1.5">
                {t('export.optionalFormats')}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(
                  [
                    { key: 'woff' as const, label: 'WOFF' },
                    { key: 'eot' as const, label: 'EOT' },
                  ] as const
                ).map(({ key, label }) => (
                  <label
                    key={key}
                    className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                    onMouseEnter={(e) => onFormatHover(key, e.currentTarget)}
                    onMouseLeave={onFormatLeave}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFormats[key]}
                      onChange={(e) =>
                        setSelectedFormats((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="rounded border-border"
                    />
                    <span
                      className={cn(
                        'font-mono',
                        hoveredFormat === key ? 'text-accent' : 'text-foreground-muted'
                      )}
                    >
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* 伴随文件 */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs text-foreground-muted mb-1.5">
                {t('export.companionFiles')}
              </div>
              <div className="flex flex-col gap-2">
                {(
                  [
                    {
                      key: 'css' as const,
                      labelKey: 'export.includeCss',
                      descKey: 'export.includeCssDesc',
                      infoKey: 'css',
                      recommended: true,
                    },
                    {
                      key: 'js' as const,
                      labelKey: 'export.includeSymbol',
                      descKey: 'export.includeSymbolDesc',
                      infoKey: 'js',
                      recommended: true,
                    },
                  ] as const
                ).map(({ key, labelKey, descKey, infoKey, recommended }) => (
                  <div key={key}>
                    <label
                      className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                      onMouseEnter={
                        infoKey ? (e) => onFormatHover(infoKey, e.currentTarget) : undefined
                      }
                      onMouseLeave={infoKey ? onFormatLeave : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFormats[key]}
                        onChange={(e) =>
                          setSelectedFormats((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="rounded border-border"
                      />
                      <span className="text-foreground">{t(labelKey)}</span>
                      {recommended && (
                        <span className="px-1.5 py-px rounded text-[10px] font-medium bg-accent-subtle text-accent">
                          {t('export.recommended')}
                        </span>
                      )}
                    </label>
                    <p className="text-xs text-foreground-muted mt-0.5 ml-5">{t(descKey)}</p>
                  </div>
                ))}
                {/* HTML 演示页面 + 预览入口 */}
                <div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFormats.html}
                        onChange={(e) =>
                          setSelectedFormats((prev) => ({ ...prev, html: e.target.checked }))
                        }
                        className="rounded border-border"
                      />
                      <span className="text-foreground">{t('export.includeDemo')}</span>
                      <span className="px-1.5 py-px rounded text-[10px] font-medium bg-accent-subtle text-accent">
                        {t('export.recommended')}
                      </span>
                    </label>
                    {selectedFormats.html && (
                      <button
                        type="button"
                        onClick={() => setPreviewVisible(true)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent-subtle transition-colors cursor-pointer"
                      >
                        <svg
                          className="w-3 h-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        {t('export.previewDemoPage')}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted mt-0.5 ml-5">
                    {t('export.includeDemoDesc')}
                  </p>
                </div>
              </div>
            </div>

            {/* 包含 .icp 项目文件 */}
            <div className="mt-3">
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedFormats.icp}
                  onChange={(e) =>
                    setSelectedFormats((prev) => ({ ...prev, icp: e.target.checked }))
                  }
                  className="rounded border-border"
                />
                <span className="text-foreground">{t('export.includeIcp')}</span>
              </label>
              <p className="text-xs text-foreground-muted mt-0.5 ml-5">
                {t('export.includeIcpDesc')}
              </p>
              <div className="flex items-center gap-2 p-2 rounded-md bg-info-subtle text-info text-[11px] leading-relaxed mt-1.5 ml-5">
                <span className="shrink-0">ℹ</span>
                <span>{t('export.icpMigrationHint')}</span>
              </div>
            </div>

            {/* 自动打包 ZIP */}
            <div className="mt-3">
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={zipEnabled}
                  onChange={(e) => setZipEnabled(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-foreground">{t('export.zip')}</span>
              </label>
              <p className="text-xs text-foreground-muted mt-0.5 ml-5">{t('export.zipDesc')}</p>
            </div>

            {/* 导出位置 */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs text-foreground-muted mb-1.5">{t('export.location')}</div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-border bg-surface-muted text-xs text-foreground truncate font-mono cursor-pointer hover:border-accent/40 transition-colors"
                  onClick={handleBrowseDir}
                  title={exportParentDir || t('export.noDir')}
                >
                  {exportParentDir || t('export.noDir')}
                </div>
                <Button onClick={handleBrowseDir} className="shrink-0 text-xs">
                  {t('export.browse')}
                </Button>
              </div>
              {exportTargetDir && (
                <p className="text-xs text-foreground-muted mt-1 truncate" title={exportTargetDir}>
                  {t('export.targetPath')}
                  {exportTargetDir}
                  {zipEnabled ? '.zip' : '/'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 导出进度阶段 */}
        {(exportPhase === 'exporting' || exportPhase === 'done' || exportPhase === 'error') && (
          <div className="py-2">
            <Progress
              percent={exportProgress}
              status={
                exportPhase === 'error'
                  ? 'exception'
                  : exportPhase === 'done'
                    ? 'success'
                    : 'active'
              }
            />
            <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed text-foreground-muted max-h-[180px] overflow-y-auto">
              {exportLogs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    log.startsWith('✓') && 'text-success font-semibold',
                    log.startsWith('✗') && 'text-danger font-semibold'
                  )}
                >
                  {log}
                </div>
              ))}
              <div ref={exportLogsEndRef} />
            </div>
            {exportPhase === 'done' && exportedDirPath && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {selectedFormats.html && (
                    <button
                      onClick={() =>
                        electronAPI.openPath(`${exportedDirPath}/${exportedProjectName}.html`)
                      }
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-medium',
                        'border border-border',
                        'text-accent hover:bg-accent-subtle',
                        'transition-colors duration-150 cursor-pointer'
                      )}
                    >
                      {t('export.previewPage')}
                    </button>
                  )}
                  {selectedFormats.icp && (
                    <button
                      onClick={() =>
                        electronAPI.openPath(`${exportedDirPath}/${exportedProjectName}.icp`)
                      }
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-medium',
                        'border border-border',
                        'text-accent hover:bg-accent-subtle',
                        'transition-colors duration-150 cursor-pointer'
                      )}
                    >
                      {t('export.projectFile')}
                    </button>
                  )}
                  <button
                    onClick={() => electronAPI.openPath(exportedDirPath)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium',
                      'border border-border',
                      'text-accent hover:bg-accent-subtle',
                      'transition-colors duration-150 cursor-pointer'
                    )}
                  >
                    {t('export.openDir')}
                  </button>
                </div>
                {selectedFormats.icp && (
                  <p className="text-xs text-foreground-muted">{t('export.icpEditHint')}</p>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* 演示页面预览 — 独立弹窗，可自由缩放 */}
      {previewVisible &&
        createPortal(
          <>
            {/* Backdrop — closes on click, sits above Radix overlay.
                pointer-events: auto overrides Radix's body pointer-events: none */}
            <div
              className="fixed inset-0 bg-black/40"
              style={{ zIndex: 99990, pointerEvents: 'auto' }}
              onClick={() => setPreviewVisible(false)}
            />
            {/* Window — sits above backdrop */}
            <div
              className="fixed bg-surface rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden"
              style={{
                zIndex: 99991,
                pointerEvents: 'auto',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '80vw',
                height: '75vh',
                maxWidth: 1200,
                maxHeight: 900,
                minWidth: 400,
                minHeight: 300,
                resize: 'both',
              }}
            >
              {/* Title bar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-muted shrink-0">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-accent"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span className="text-sm font-medium text-foreground">
                    {t('export.previewDemoPage')}
                  </span>
                  <span className="text-[11px] text-foreground-muted">
                    {t('export.previewHint')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewVisible(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-muted hover:bg-surface-accent hover:text-foreground transition-colors cursor-pointer"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {/* iframe */}
              {previewHTML ? (
                <iframe
                  srcDoc={previewHTML}
                  className="flex-1 w-full border-0"
                  sandbox="allow-scripts"
                  title={t('export.previewDemoPage')}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-foreground-muted">
                  {t('export.previewLoading')}
                </div>
              )}
            </div>
          </>,
          document.body
        )}

      {/* 格式知识卡片 — portal 到 body, 在 Radix Dialog overlay 之上 */}
      {hoveredFormat &&
        FORMAT_INFO[hoveredFormat] &&
        createPortal(
          <div
            className="fixed pointer-events-auto"
            style={{
              left: cardPos.x,
              top: cardPos.y,
              width: cardPos.w,
              maxWidth: 340,
              zIndex: 99999,
            }}
            onMouseEnter={onCardEnter}
            onMouseLeave={onCardLeave}
          >
            <div className="px-3 py-2.5 rounded-lg border border-border bg-surface shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-semibold text-accent">
                  .{hoveredFormat}
                </span>
                <button
                  type="button"
                  onClick={() => openWikiPage(FORMAT_INFO[hoveredFormat!].wiki)}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent-subtle transition-colors whitespace-nowrap"
                >
                  Wiki
                  <svg
                    className="w-2.5 h-2.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 17L17 7" />
                    <path d="M7 7h10v10" />
                  </svg>
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-foreground-muted mt-1">
                {t(FORMAT_INFO[hoveredFormat].summaryKey)}
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default ExportDialog;
