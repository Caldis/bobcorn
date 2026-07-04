// Electron API (via preload contextBridge)
const { electronAPI } = window;

import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, Button, Checkbox, CheckboxGroup, Progress } from '../ui';
import { message } from '../ui/toast';
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
import { TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { analyticsTrack } from '../../store';
import { getOption, setOption, type ExportFontSettings } from '../../config';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.set-name, project.set-prefix, export.font, export.svg
import db from '../../database';
import { auditIconCodes } from './codeCoverage';
import type { ExportGroupOption } from './types';

// ── 路径工具 (内联,仅本组件使用) ────────────────────────────────
const PATH_SEP = electronAPI.platform === 'win32' ? '\\' : '/';
// 故意检测控制字符 (文件名禁止),与 lint 的 no-control-regex 默认告警冲突,显式豁免
// eslint-disable-next-line no-control-regex
const ILLEGAL_NAME_RE = electronAPI.platform === 'win32' ? /[<>:"|?*\x00-\x1F]/g : /[/\x00]/g;

/** 将所有 / 和 \ 统一为平台分隔符,去除尾随 sep (但保留 Windows 盘根 / POSIX 根) */
function normalizePath(p: string): string {
  if (!p) return '';
  let s = p.replace(/[\\/]+/g, PATH_SEP);
  // 保留盘根 (C:\) 与 POSIX 根 (/)
  while (s.length > 1 && s.endsWith(PATH_SEP) && !/^[A-Za-z]:\\$/.test(s) && s !== '/') {
    s = s.slice(0, -PATH_SEP.length);
  }
  return s;
}

/** 拆分末级目录名与父目录 */
function splitTail(p: string): { parent: string; name: string } {
  const norm = normalizePath(p);
  const idx = norm.lastIndexOf(PATH_SEP);
  if (idx < 0) return { parent: '', name: norm };
  // POSIX: 路径以 / 开头时父目录为 '/'
  const parent = idx === 0 ? PATH_SEP : norm.slice(0, idx);
  return { parent, name: norm.slice(idx + 1) };
}

/** 拼接父目录与末级名称 */
function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  if (parent.endsWith(PATH_SEP)) return parent + name;
  return parent + PATH_SEP + name;
}

/** 提取目录名中的非法字符 (用于错误提示),返回去重后的字符串 */
function extractIllegalChars(name: string): string {
  const matches = name.match(ILLEGAL_NAME_RE);
  if (!matches) return '';
  return Array.from(new Set(matches)).join(' ');
}

/** 在 parent 下找到 base-1, base-2... 第一个不存在的名字 (suffix 用于 ZIP 模式校验 .zip 文件) */
function findAvailableName(parent: string, base: string, suffix: string = ''): string {
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!electronAPI.existsSync(joinPath(parent, candidate + suffix))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

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

  // 导出目录: 父目录 + 末级目录名 (可由用户自定义) — 加载自持久化
  const [exportParentDir, setExportParentDir] = useState<string>('');
  // null 表示沿用项目名;非空字符串覆盖项目名
  const [customDirName, setCustomDirName] = useState<string | null>(null);

  // 分组选择
  const [exportGroupFullList, setExportGroupFullList] = useState<ExportGroupOption[]>([]);
  const [exportGroupSelected, setExportGroupSelected] = useState<string[]>([]);
  const [exportGroupCheckAll, setExportGroupCheckAll] = useState<boolean>(true);
  const [exportGroupIndeterminate, setExportGroupIndeterminate] = useState<boolean>(false);

  // Format selection — 加载自持久化 (svg/ttf/woff2 必选,固定 true)
  const persistedSettings = getOption('exportFontSettings') as ExportFontSettings;
  const [selectedFormats, setSelectedFormats] = useState({
    svg: true,
    ttf: true,
    woff2: true,
    css: persistedSettings.companion.css,
    woff: persistedSettings.optionalFormats.woff,
    eot: persistedSettings.optionalFormats.eot,
    js: persistedSettings.companion.js,
    html: persistedSettings.companion.html,
    icp: persistedSettings.companion.icp,
  });
  const [zipEnabled, setZipEnabled] = useState(persistedSettings.zip);

  // 目录冲突弹窗状态 — baseName/renamedBase 是不带后缀的目录名,isZip 控制弹窗显示
  const [conflictPending, setConflictPending] = useState<{
    baseName: string;
    renamedBase: string;
    isZip: boolean;
  } | null>(null);

  // 字码审计详情弹窗
  const [auditDetailVisible, setAuditDetailVisible] = useState(false);

  // Preview panel
  const [previewVisible, setPreviewVisible] = useState(false);

  // 导出统计缓存 (避免渲染中反复查 DB)
  const [exportTotalIcons, setExportTotalIcons] = useState<number>(0);
  const [exportTotalGroups, setExportTotalGroups] = useState<number>(0);
  const [exportSelectedIconCount, setExportSelectedIconCount] = useState<number>(0);
  const groupIconCountsRef = useRef<Record<string, number>>({});

  // 当对话框打开时初始化分组列表 + 还原持久化的选择
  const initGroupList = () => {
    const groups = db.getGroupList();
    const totalIcons = db.getIconCount();
    const groupList: ExportGroupOption[] = groups.map((group: any) => ({
      label: group.groupName,
      value: group.id,
    }));
    setExportGroupFullList(groupList);

    // 还原分组选择: 'all' = 全选 (含未来新分组),数组 = 显式列表 (过滤掉已删除的分组)
    const persisted = (getOption('exportFontSettings') as ExportFontSettings).groupSelected;
    const allIds = groupList.map((g) => g.value);
    let initialSelected: string[];
    let initialAll: boolean;
    if (persisted === 'all') {
      initialSelected = allIds;
      initialAll = true;
    } else {
      const validIds = new Set(allIds);
      initialSelected = (persisted as string[]).filter((id) => validIds.has(id));
      if (initialSelected.length === 0) {
        // 持久化的分组都已不存在 → 回退全选
        initialSelected = allIds;
        initialAll = true;
      } else {
        initialAll = initialSelected.length === allIds.length;
      }
    }
    setExportGroupSelected(initialSelected);
    setExportGroupCheckAll(initialAll);
    setExportGroupIndeterminate(!initialAll && initialSelected.length > 0);

    // 预缓存每个分组的图标计数,避免 checkbox 变化时查 DB
    const counts: Record<string, number> = {};
    groups.forEach((g: any) => {
      counts[g.id] = db.getIconCountFromGroup(g.id);
    });
    groupIconCountsRef.current = counts;
    setExportTotalIcons(totalIcons);
    setExportTotalGroups(groups.length);
    setExportSelectedIconCount(
      initialAll ? totalIcons : initialSelected.reduce((sum, id) => sum + (counts[id] || 0), 0)
    );
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

  // 导出前字码审计 — 跟随分组选择, 检出导出集内的重复/非法字码
  const codeAudit = useMemo(() => {
    if (!visible) return null;
    try {
      const allGroupSelected =
        exportGroupSelected.length === 0 ||
        exportGroupFullList.length === exportGroupSelected.length;
      const meta = db.getExportIconCodeMeta();
      const selected = allGroupSelected
        ? meta
        : meta.filter((m: any) => exportGroupSelected.includes(m.iconGroup));
      return auditIconCodes(selected);
    } catch {
      return null;
    }
  }, [visible, exportGroupSelected, exportGroupFullList]);
  const auditDuplicateIconCount = codeAudit
    ? codeAudit.duplicateGroups.reduce((sum, g) => sum + g.icons.length, 0)
    : 0;

  // 当 visible 变为 true 时初始化 (load persisted settings + groups)
  const prevVisibleRef = useRef(false);
  if (visible && !prevVisibleRef.current) {
    initGroupList();
    const s = getOption('exportFontSettings') as ExportFontSettings;
    // 父目录: 用持久化值,空则回退到桌面
    setExportParentDir(s.parentDir || electronAPI.getAppPath('desktop'));
    setCustomDirName(s.customDirName);
  }
  prevVisibleRef.current = visible;

  // 选择导出目录 — 仅修改父目录,保留用户已编辑的末级目录名
  const handleBrowseDir = async () => {
    const result = await electronAPI.showOpenDialog({
      title: t('export.selectLocationTitle'),
      defaultPath: exportParentDir || electronAPI.getAppPath('desktop'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result.canceled && result.filePaths?.length) {
      setExportParentDir(normalizePath(result.filePaths[0]));
    }
  };

  // 当前显示给用户的末级目录名 (用户自定义优先,否则用项目名)
  const effectiveDirName = customDirName ?? db.getProjectName();
  // 完整目标目录 (用于导出路径)
  const exportTargetDir = exportParentDir ? joinPath(exportParentDir, effectiveDirName) : '';
  // input 显示值 — ZIP 模式下自动补 .zip 后缀,让用户看到真实输出目标
  const displayedTargetDir = exportTargetDir ? exportTargetDir + (zipEnabled ? '.zip' : '') : '';

  // 用户编辑 input — ZIP 模式下剥离尾部 .zip (避免与自动补全的后缀重复)
  const handleEditTargetDir = (rawValue: string) => {
    if (!rawValue) {
      setCustomDirName('');
      return;
    }
    const stripped = zipEnabled ? rawValue.replace(/\.zip$/i, '') : rawValue;
    const { parent, name } = splitTail(stripped);
    if (parent) setExportParentDir(parent);
    setCustomDirName(name);
  };

  // 失焦时格式化路径 (修正用户输入的混合分隔符 / 多余分隔符)
  const handleNormalizeOnBlur = () => {
    if (!exportTargetDir) return;
    const norm = normalizePath(exportTargetDir);
    const { parent, name } = splitTail(norm);
    if (parent !== exportParentDir) setExportParentDir(parent);
    if (name !== effectiveDirName) setCustomDirName(name);
  };

  const addExportLog = (msg: string) => {
    setExportLogs((prev) => [...prev, msg]);
    setTimeout(() => exportLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  // 验证 + 冲突检测 — 通过则直接执行,有冲突则展示弹窗
  const handleEnsureExportIconfonts = () => {
    // 1. 必须有父目录
    if (!exportParentDir) {
      message.warning(t('export.selectLocationWarning'));
      return;
    }

    // 2. 末级目录名非空
    const dirName = effectiveDirName.trim();
    if (!dirName) {
      message.warning(t('export.dirNameEmpty'));
      return;
    }

    // 3. 末级目录名不含非法字符
    const illegal = extractIllegalChars(dirName);
    if (illegal) {
      message.warning(t('export.dirNameInvalid', { chars: illegal }));
      return;
    }

    // 4. 父目录存在且可访问
    if (
      !electronAPI.accessSync(exportParentDir) ||
      !electronAPI.statSync(exportParentDir).isDirectory
    ) {
      message.warning(t('export.parentDirInvalid', { path: exportParentDir }));
      return;
    }

    // 5. 至少有图标可导出
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

    // 6. 目录冲突 — 弹窗询问处理方式 (ZIP 模式下检查 .zip 文件,目录模式下检查目录)
    const suffix = zipEnabled ? '.zip' : '';
    const targetPath = joinPath(exportParentDir, dirName + suffix);
    if (electronAPI.existsSync(targetPath)) {
      const renamedBase = findAvailableName(exportParentDir, dirName, suffix);
      setConflictPending({ baseName: dirName, renamedBase, isZip: zipEnabled });
      return;
    }

    // 无冲突 — 直接执行
    executeExport(dirName);
  };

  // 处理冲突弹窗的用户选择
  const handleConflictResolve = (action: 'overwrite' | 'rename' | 'cancel') => {
    if (!conflictPending) return;
    const pending = conflictPending;
    setConflictPending(null);
    if (action === 'cancel') return;
    const finalName = action === 'rename' ? pending.renamedBase : pending.baseName;
    executeExport(finalName);
  };

  // 实际执行导出管线 (校验通过后调用)
  const executeExport = async (finalDirName: string) => {
    const allGroupSelected =
      exportGroupSelected.length === 0 || exportGroupFullList.length === exportGroupSelected.length;
    const allIcons = db.getIconList();
    const selectedIcons = allGroupSelected
      ? allIcons
      : allIcons.filter((icon: any) => exportGroupSelected.includes(icon.iconGroup));

    // 非法字码图标无法生成字形 (String.fromCodePoint 会抛 RangeError), 从导出集跳过
    const invalidIds = new Set(
      auditIconCodes(
        selectedIcons.map((i: any) => ({ id: i.id, iconName: i.iconName, iconCode: i.iconCode }))
      ).invalidIcons.map((i) => i.id)
    );
    const icons = invalidIds.size
      ? selectedIcons.filter((icon: any) => !invalidIds.has(icon.id))
      : selectedIcons;
    if (!icons.length) {
      message.warning(t('export.noIconsWarning'));
      return;
    }

    const projectName = db.getProjectName();
    const dirPath = joinPath(exportParentDir, finalDirName);

    // 切换到导出进度视图 — exportedProjectName 用于打开内部文件,
    // 始终用 projectName (因为 CSS/字体类名仍引用项目名,文件名也是 projectName.*)
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
      if (invalidIds.size) {
        addExportLog(t('export.progress.skippedInvalid', { num: invalidIds.size }));
      }

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
      window.dispatchEvent(new CustomEvent('bobcorn:export-triggered'));
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

  // 持久化当前所有导出设置 (跟随用户态,不写入项目文件)
  const persistExportSettings = () => {
    setOption({
      exportFontSettings: {
        groupSelected: exportGroupCheckAll ? 'all' : exportGroupSelected,
        optionalFormats: { woff: selectedFormats.woff, eot: selectedFormats.eot },
        companion: {
          css: selectedFormats.css,
          js: selectedFormats.js,
          html: selectedFormats.html,
          icp: selectedFormats.icp,
        },
        zip: zipEnabled,
        parentDir: exportParentDir || null,
        customDirName: customDirName,
      },
    });
  };

  const handleCancel = () => {
    persistExportSettings();
    onClose();
    // 关闭后仅重置临时进度状态,持久化字段 (parentDir/customDirName/选中分组/格式/zip) 保留
    setTimeout(() => {
      setExportPhase('config');
      setExportProgress(0);
      setExportLogs([]);
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

            {/* 分组选择 — 小标题 + 滚动区,无折叠;数量描述置于全选行 */}
            <div>
              <div className="text-xs text-foreground-muted mb-1.5">{t('export.groups')}</div>
              <div className="rounded-lg border border-border max-h-[200px] overflow-y-auto">
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5 mb-1.5">
                    <Checkbox
                      indeterminate={exportGroupIndeterminate}
                      onChange={onTargetGroupCheckAllChange}
                      checked={exportGroupCheckAll}
                    >
                      {t('export.selectAll')}
                    </Checkbox>
                    <span className="text-xs text-foreground-muted shrink-0">
                      {exportGroupCheckAll
                        ? t('export.groupsAll', {
                            groups: exportTotalGroups,
                            icons: exportTotalIcons,
                          })
                        : t('export.groupsPartial', {
                            groups: exportGroupSelected.length,
                            total: exportTotalGroups,
                            icons: exportSelectedIconCount,
                          })}
                    </span>
                  </div>
                  <CheckboxGroup
                    options={exportGroupFullList}
                    value={exportGroupSelected}
                    onChange={onTargetGroupChange}
                  />
                </div>
              </div>
            </div>

            {/* 字码审计警示 — 导出集内存在重复/非法字码时提示, 可查看详情, 不阻断导出 */}
            {codeAudit && !codeAudit.ok && (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2">
                <div className="flex items-start gap-2">
                  <TriangleAlert size={14} className="text-warning shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 text-xs text-foreground leading-relaxed">
                    <p>
                      {codeAudit.duplicateGroups.length > 0 &&
                        t('export.codeAuditDuplicates', {
                          codes: codeAudit.duplicateGroups.length,
                          icons: auditDuplicateIconCount,
                        })}
                      {codeAudit.duplicateGroups.length > 0 &&
                        codeAudit.invalidIcons.length > 0 && (
                          <span className="mx-1 text-foreground-muted/50">·</span>
                        )}
                      {codeAudit.invalidIcons.length > 0 &&
                        t('export.codeAuditInvalid', { num: codeAudit.invalidIcons.length })}
                    </p>
                    <p className="text-foreground-muted mt-0.5">{t('export.codeAuditNote')}</p>
                  </div>
                  <button
                    onClick={() => setAuditDetailVisible(true)}
                    className={cn(
                      'shrink-0 px-2 py-0.5 rounded text-xs font-medium',
                      'text-warning border border-warning/40',
                      'hover:bg-warning/10 transition-colors duration-100'
                    )}
                  >
                    {t('export.codeAuditView')}
                  </button>
                </div>
              </div>
            )}

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

            {/* 导出位置 — 可编辑完整路径 + [选择] 按钮高度对齐;ZIP 复选框置于下方 */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs text-foreground-muted mb-1.5">{t('export.location')}</div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={displayedTargetDir}
                  onChange={(e) => handleEditTargetDir(e.target.value)}
                  onBlur={handleNormalizeOnBlur}
                  placeholder={t('export.noDir')}
                  title={displayedTargetDir || t('export.noDir')}
                  spellCheck={false}
                  className="flex-1 min-w-0 h-8 px-2.5 rounded border border-border bg-surface-muted text-xs text-foreground font-mono outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30"
                />
                <Button onClick={handleBrowseDir} className="shrink-0 text-xs h-8">
                  {t('export.browse')}
                </Button>
              </div>
              {/* 自动打包 (ZIP) — 移至原"文件将导出至"位置 */}
              <div className="mt-2">
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

      {/* 目标冲突弹窗 — 覆盖 / 存储为 X / 取消 三选 (目录与 .zip 文件共用) */}
      <Dialog
        open={!!conflictPending}
        onClose={() => handleConflictResolve('cancel')}
        title={t('export.conflict.title')}
        footer={
          conflictPending ? (
            <>
              <Button onClick={() => handleConflictResolve('cancel')}>{t('common.cancel')}</Button>
              <Button onClick={() => handleConflictResolve('rename')}>
                {t('export.conflict.rename', {
                  name: conflictPending.renamedBase + (conflictPending.isZip ? '.zip' : ''),
                })}
              </Button>
              <Button type="primary" onClick={() => handleConflictResolve('overwrite')}>
                {t('export.conflict.overwrite')}
              </Button>
            </>
          ) : null
        }
      >
        {conflictPending && (
          <p className="text-sm text-foreground">
            {t('export.conflict.content', {
              name: conflictPending.baseName + (conflictPending.isZip ? '.zip' : ''),
            })}
          </p>
        )}
      </Dialog>

      {/* 字码审计详情弹窗 — 按码分组列出受影响图标 (保留/丢弃/跳过) */}
      <Dialog
        open={auditDetailVisible}
        onClose={() => setAuditDetailVisible(false)}
        title={t('export.codeAuditTitle')}
        footer={
          <Button type="primary" onClick={() => setAuditDetailVisible(false)}>
            {t('common.close')}
          </Button>
        }
      >
        {codeAudit && (
          <div className="max-h-[50vh] overflow-y-auto space-y-3 text-sm pr-1">
            {codeAudit.duplicateGroups.length > 0 && (
              <div>
                <p className="text-xs text-foreground-muted mb-1.5">
                  {t('export.codeAuditDupSection', { num: codeAudit.duplicateGroups.length })}
                </p>
                <div className="space-y-1.5">
                  {codeAudit.duplicateGroups.map((group) => (
                    <div key={group.code} className="rounded-md border border-border px-2.5 py-1.5">
                      <div className="font-mono text-xs font-semibold text-foreground">
                        {group.code}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {group.icons.map((icon, i) => (
                          <div
                            key={icon.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate text-foreground-muted">{icon.iconName}</span>
                            <span
                              className={cn(
                                'shrink-0 text-[10px] px-1.5 py-px rounded-full',
                                i === 0 ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'
                              )}
                            >
                              {i === 0 ? t('export.codeAuditKeep') : t('export.codeAuditDrop')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {codeAudit.invalidIcons.length > 0 && (
              <div>
                <p className="text-xs text-foreground-muted mb-1.5">
                  {t('export.codeAuditInvalidSection', { num: codeAudit.invalidIcons.length })}
                </p>
                <div className="space-y-0.5 rounded-md border border-border px-2.5 py-1.5">
                  {codeAudit.invalidIcons.map((icon) => (
                    <div key={icon.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-foreground-muted">{icon.iconName}</span>
                      <span className="shrink-0 font-mono text-danger">{icon.iconCode || '∅'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-foreground-muted">{t('export.codeAuditFixHint')}</p>
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
