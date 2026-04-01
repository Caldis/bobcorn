// Electron API (via preload contextBridge)
const { electronAPI } = window;

import React, { useState, useRef } from 'react';
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
import db from '../../database';
import type { ExportGroupOption } from './types';

interface ExportDialogProps {
  visible: boolean;
  onClose: () => void;
}

function ExportDialog({ visible, onClose }: ExportDialogProps) {
  const { t } = useTranslation();
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
    css: true, // required, always true
    woff: true,
    eot: true,
    js: true,
    html: true, // optional, default ON
    icp: false, // optional, default OFF
  });
  const [zipEnabled, setZipEnabled] = useState(false);

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
    const icons = allGroupSelected
      ? db.getIconList()
      : db.getIconListFromGroup(exportGroupSelected);
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
        <Button key="export" type="primary" onClick={handleEnsureExportIconfonts}>
          {t('export.exportBtn')}
        </Button>
      </>
    ) : exportPhase === 'done' || exportPhase === 'error' ? (
      <Button key="close" type="primary" onClick={handleCancel}>
        {t('common.close')}
      </Button>
    ) : null;

  return (
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
              className="flex items-center justify-between px-3 py-2 bg-surface-muted cursor-pointer hover:bg-surface-accent transition-colors"
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

          {/* 迁移提示 */}
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs leading-relaxed mt-4">
            <span className="shrink-0 mt-0.5">ℹ</span>
            <span>
              {t('export.icpMigrationHint', {
                shortcut: platform() === 'darwin' ? '⌘S' : 'Ctrl+S',
              })}
            </span>
          </div>

          {/* 必选格式 */}
          <div className="mt-3">
            <div className="text-xs text-foreground-muted mb-1.5">
              {t('export.requiredFormats')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['SVG', 'TTF', 'WOFF2', 'CSS'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900/40 text-xs text-brand-700 dark:text-brand-300 font-mono"
                >
                  .{fmt.toLowerCase()}
                </span>
              ))}
            </div>
          </div>

          {/* 可选格式 */}
          <div className="mt-3">
            <div className="text-xs text-foreground-muted mb-1.5">
              {t('export.optionalFormats')}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(
                [
                  { key: 'woff' as const, label: '.woff' },
                  { key: 'eot' as const, label: '.eot' },
                  { key: 'js' as const, label: '.js (Symbol)' },
                  { key: 'html' as const, label: '.html (Demo)' },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFormats[key]}
                    onChange={(e) =>
                      setSelectedFormats((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="rounded border-border"
                  />
                  <span className="font-mono text-foreground-muted">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 包含 .icp 项目文件 */}
          <div className="mt-3">
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={selectedFormats.icp}
                onChange={(e) => setSelectedFormats((prev) => ({ ...prev, icp: e.target.checked }))}
                className="rounded border-border"
              />
              <span className="text-foreground">{t('export.includeIcp')}</span>
            </label>
            <p className="text-xs text-foreground-muted mt-0.5 ml-5">
              {t('export.includeIcpDesc')}
            </p>
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
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-border bg-surface-muted text-xs text-foreground truncate font-mono cursor-pointer hover:border-brand-300 transition-colors"
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
              exportPhase === 'error' ? 'exception' : exportPhase === 'done' ? 'success' : 'active'
            }
          />
          <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed text-foreground-muted max-h-[180px] overflow-y-auto">
            {exportLogs.map((log, i) => (
              <div
                key={i}
                className={cn(
                  log.startsWith('✓') && 'text-green-500 font-semibold',
                  log.startsWith('✗') && 'text-red-500 font-semibold'
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
                      'text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30',
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
                      'text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30',
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
                    'text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30',
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
  );
}

export default ExportDialog;
