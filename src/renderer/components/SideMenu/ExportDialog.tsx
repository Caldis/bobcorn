// Electron API (via preload contextBridge)
const { electronAPI } = window;

import React, { useState, useRef } from 'react';
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
import { cn } from '../../lib/utils';
import db from '../../database';
import type { ExportGroupOption } from './types';

interface ExportDialogProps {
  visible: boolean;
  onClose: () => void;
}

function ExportDialog({ visible, onClose }: ExportDialogProps) {
  // 导出进度
  const [exportPhase, setExportPhase] = useState<'config' | 'exporting' | 'done' | 'error'>(
    'config'
  );
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const exportLogsEndRef = useRef<HTMLDivElement>(null);

  // 分组选择
  const [exportGroupFullList, setExportGroupFullList] = useState<ExportGroupOption[]>([]);
  const [exportGroupSelected, setExportGroupSelected] = useState<string[]>([]);
  const [exportGroupCheckAll, setExportGroupCheckAll] = useState<boolean>(true);
  const [exportGroupIndeterminate, setExportGroupIndeterminate] = useState<boolean>(false);
  const [exportGroupModelVisible, setExportGroupModelVisible] = useState<boolean>(false);

  // 导出统计缓存 (避免渲染中反复查 DB)
  const [exportTotalIcons, setExportTotalIcons] = useState<number>(0);
  const [exportTotalGroups, setExportTotalGroups] = useState<number>(0);
  const [exportSelectedIconCount, setExportSelectedIconCount] = useState<number>(0);

  // 当对话框打开时初始化分组列表
  const initGroupList = () => {
    const groupList: ExportGroupOption[] = db.getGroupList().map((group: any) => ({
      label: group.groupName,
      value: group.id,
    }));
    setExportGroupFullList(groupList);
    setExportGroupSelected(groupList.map((group) => group.value));
    setExportGroupIndeterminate(false);
    setExportGroupCheckAll(true);
    setExportTotalIcons(db.getIconCount());
    setExportTotalGroups(db.getGroupList().length);
    setExportSelectedIconCount(db.getIconCount());
  };

  // 当 visible 变为 true 时初始化
  const prevVisibleRef = useRef(false);
  if (visible && !prevVisibleRef.current) {
    initGroupList();
  }
  prevVisibleRef.current = visible;

  const addExportLog = (msg: string) => {
    setExportLogs((prev) => [...prev, msg]);
    setTimeout(() => exportLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleEnsureExportIconfonts = async () => {
    const allGroupSelected =
      exportGroupSelected.length === 0 || exportGroupFullList.length === exportGroupSelected.length;
    const icons = allGroupSelected
      ? db.getIconList()
      : db.getIconListFromGroup(exportGroupSelected);
    if (!icons.length) {
      message.warning('当前项目没有任何图标可供导出');
      return;
    }

    // 先选目录
    const result = await electronAPI.showSaveDialog({
      title: '导出图标字体',
      defaultPath: `${db.getProjectName()}`,
    });
    if (result.canceled || !result.filePath) return;

    const dirPath = result.filePath;
    const projectName = db.getProjectName();

    // 切换到导出进度视图
    setExportPhase('exporting');
    setExportProgress(0);
    setExportLogs([]);

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
      await step(5, `准备导出 ${icons.length} 个图标...`);

      const groups = db.getGroupList();
      groups.push({
        id: 'resource-uncategorized',
        groupName: '未分组',
        groupOrder: -1,
        groupColor: '',
      });

      await step(10, '生成 HTML 演示页面...');
      const pageData = demoHTMLGenerator(
        groups,
        icons.map((icon: any) => Object.assign({}, icon, { iconContent: '' }))
      );

      await step(15, '生成 CSS 样式表...');
      const cssData = iconfontCSSGenerator(icons);

      await step(20, '生成 JS Symbol 引用...');
      const jsData = iconfontSymbolGenerator(icons);

      await step(25, `生成 SVG 字体 (${icons.length} glyphs)...`);
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
          (result: string) => (result ? resolve(result) : reject(new Error('SVG 字体生成失败'))),
          // 进度回调 — SVG 字体生成占 25%→45% 区间
          (processed: number, total: number) => {
            const pct = 25 + Math.round((processed / total) * 20);
            setExportProgress(pct);
            // 只在关键节点记日志，不刷屏
            if (processed === total) {
              addExportLog(`  SVG 字体生成完成 (${total} glyphs)`);
            }
          }
        );
      });

      await step(45, '转换 TTF 字体...');
      const ttfFont = ttfFontGenerator({ svgFont });

      await step(55, '转换 WOFF 字体...');
      const woffFont = woffFontGenerator({ ttfFont });

      await step(65, '转换 WOFF2 字体...');
      const woff2Font = woff2FontGenerator({ ttfFont });

      await step(75, '转换 EOT 字体...');
      const eotFont = eotFontGenerator({ ttfFont });

      await step(80, '导出项目文件...');
      if (!electronAPI.accessSync(dirPath)) {
        electronAPI.mkdirSync(dirPath);
      }

      const projData = await new Promise<any>((resolve) => db.exportProject(resolve));
      const buffer = Buffer.from(projData);

      const files = [
        { name: `${projectName}.icp`, data: buffer },
        { name: `${projectName}.html`, data: pageData },
        { name: `${projectName}.css`, data: cssData },
        { name: `${projectName}.js`, data: jsData },
        { name: `${projectName}.svg`, data: svgFont },
        { name: `${projectName}.ttf`, data: Buffer.from(ttfFont.buffer) },
        { name: `${projectName}.woff`, data: Buffer.from(woffFont.buffer) },
        { name: `${projectName}.woff2`, data: Buffer.from(woff2Font.buffer) },
        { name: `${projectName}.eot`, data: Buffer.from(eotFont.buffer) },
      ];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        await step(80 + Math.round(((i + 1) / files.length) * 18), `写入 ${f.name}`);
        electronAPI.writeFileSync(`${dirPath}/${f.name}`, f.data);
      }

      await step(100, `✓ 导出完成！共 ${files.length} 个文件`);
      setExportPhase('done');
    } catch (err: any) {
      console.error(err);
      const errMsg =
        err === 'Checksum error in glyf' ? '请确保路径已全部转换为轮廓' : err.message || err;
      addExportLog(`✗ 导出失败: ${errMsg}`);
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
    setExportSelectedIconCount(
      isAll ? exportTotalIcons : db.getIconListFromGroup(checkedValues).length
    );
  };

  const dialogTitle =
    exportPhase === 'config'
      ? '导出图标字体'
      : exportPhase === 'done'
        ? '导出完成'
        : exportPhase === 'error'
          ? '导出失败'
          : '正在导出...';

  const dialogFooter =
    exportPhase === 'config' ? (
      <>
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>
        <Button key="export" type="primary" onClick={handleEnsureExportIconfonts}>
          导出图标字体
        </Button>
      </>
    ) : exportPhase === 'done' || exportPhase === 'error' ? (
      <Button key="close" type="primary" onClick={handleCancel}>
        关闭
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
            导出图标字体能让您在网页中以图标字码或关联类名的方式直接引用图标。
          </p>

          {/* 分组选择 — 内联折叠 */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 bg-surface-muted cursor-pointer hover:bg-surface-accent transition-colors"
              onClick={() => setExportGroupModelVisible(!exportGroupModelVisible)}
            >
              <span className="text-sm font-medium text-foreground">导出分组</span>
              <span className="text-xs text-foreground-muted">
                {exportGroupCheckAll
                  ? `全部 (${exportTotalGroups} 个分组，${exportTotalIcons} 个图标)`
                  : `${exportGroupSelected.length} 个分组，${exportSelectedIconCount} 个图标`}
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
                    全选
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

          {/* 导出格式预览 */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['SVG', 'TTF', 'WOFF', 'WOFF2', 'EOT', 'CSS', 'JS', 'HTML', 'ICP'].map((fmt) => (
              <span
                key={fmt}
                className="px-2 py-0.5 rounded bg-surface-muted text-xs text-foreground-muted font-mono"
              >
                .{fmt.toLowerCase()}
              </span>
            ))}
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
          {exportPhase === 'done' && (
            <p className="mt-3 text-xs text-foreground-muted">
              下次需要继续编辑图标，请打开导出目录下的 .icp 文件
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default ExportDialog;
