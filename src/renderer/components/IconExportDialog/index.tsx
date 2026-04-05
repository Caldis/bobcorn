// src/renderer/components/IconExportDialog/index.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Button, message } from '../ui';
import { Slider } from '../ui/slider';
import { Checkbox } from '../ui/checkbox';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { ExportRow } from './ExportRow';
import { PRESETS, buildFilename, computeOutputSize } from '../../utils/export/presets';
import type { ExportRowConfig, PresetDef } from '../../utils/export/presets';
import {
  parseViewBox,
  rasterizeSvgToBlob,
  rasterizeSvgToArrayBuffer,
} from '../../utils/export/rasterize';
import { buildIcoBuffer, buildPdfBuffer } from '../../utils/export/formats';

const { electronAPI } = window as any;

// -- Types ----------------------------------------------------

export interface IconExportTarget {
  id: string;
  iconName: string;
  iconContent: string;
}

interface IconExportDialogProps {
  visible: boolean;
  onClose: () => void;
  icons: IconExportTarget[];
}

// -- Helpers --------------------------------------------------

let rowCounter = 0;
function newRowId(): string {
  return `row-${++rowCounter}`;
}

function makeDefaultRow(): ExportRowConfig {
  return { id: newRowId(), sizeMode: 'scale', scale: 1, pixelSize: 24, format: 'png' };
}

function presetToRows(preset: PresetDef): ExportRowConfig[] {
  return preset.rows.map((r) => ({ ...r, id: newRowId() }));
}

// -- Component ------------------------------------------------

export function IconExportDialog({ visible, onClose, icons }: IconExportDialogProps) {
  const { t } = useTranslation();
  const isBatch = icons.length > 1;
  const firstIcon = icons[0];

  // -- State --------------------------------------------------
  const [rows, setRows] = useState<ExportRowConfig[]>(() => [makeDefaultRow()]);
  const [quality, setQuality] = useState(92);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [icoMerge, setIcoMerge] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // -- Derived ------------------------------------------------
  const hasJpgOrWebp = rows.some((r) => r.format === 'jpg' || r.format === 'webp');
  const icoRows = rows.filter((r) => r.format === 'ico');
  const showIcoMerge = icoRows.length >= 2;

  const viewBox = useMemo(
    () => (firstIcon ? parseViewBox(firstIcon.iconContent) : { x: 0, y: 0, w: 24, h: 24 }),
    [firstIcon]
  );

  const totalFiles = useMemo(() => {
    let count = rows.length * icons.length;
    // If ICO merge is on, multiple ICO rows per icon -> 1 file per icon
    if (showIcoMerge && icoMerge) {
      const icoCount = icoRows.length;
      count -= (icoCount - 1) * icons.length;
    }
    return count;
  }, [rows, icons, showIcoMerge, icoMerge, icoRows]);

  // -- Row management -----------------------------------------
  const handleRowChange = useCallback((id: string, updates: Partial<ExportRowConfig>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    setActivePreset(null);
  }, []);

  const handleRowDelete = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setActivePreset(null);
  }, []);

  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.sizeMode === 'scale') {
        return [
          ...prev,
          {
            id: newRowId(),
            sizeMode: 'scale',
            scale: last.scale + 1,
            pixelSize: last.pixelSize,
            format: last.format,
          },
        ];
      }
      if (last) {
        return [...prev, { ...last, id: newRowId() }];
      }
      return [...prev, makeDefaultRow()];
    });
    setActivePreset(null);
  }, []);

  const handlePreset = useCallback((preset: PresetDef) => {
    setRows(presetToRows(preset));
    setActivePreset(preset.key);
    if (preset.icoMerge !== undefined) setIcoMerge(preset.icoMerge);
  }, []);

  // -- Export execution ---------------------------------------
  const handleExport = useCallback(async () => {
    if (rows.length === 0) return;

    let dirPath: string | null = null;
    const baseName: string | null = null;

    if (isBatch) {
      // Batch: must pick a directory
      const result = await electronAPI.showOpenDialog({
        title: t('iconExport.selectDir'),
        properties: ['openDirectory', 'createDirectory'],
      });
      if (!result || result.canceled || !result.filePaths?.length) return;
      dirPath = result.filePaths[0];
    } else {
      // Single icon: save dialog with base filename
      const fname =
        rows.length === 1
          ? buildFilename(firstIcon.iconName, rows[0])
          : `${firstIcon.iconName}.png`;
      const result = await electronAPI.showSaveDialog({
        title: t('iconExport.title'),
        defaultPath: fname,
      });
      if (!result || result.canceled || !result.filePath) return;
      // Extract directory and base name from chosen path
      const fullPath = result.filePath;
      const lastSep = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
      dirPath = fullPath.substring(0, lastSep);
      // Use the original icon name as base (ignore what user typed for the name part)
      // but use the directory they selected
    }

    setExporting(true);
    const total = totalFiles;
    let current = 0;
    setProgress({ current: 0, total });

    // Ensure target directory exists
    if (dirPath && !electronAPI.accessSync(dirPath)) {
      electronAPI.mkdirSync(dirPath, { recursive: true });
    }

    try {
      for (const icon of icons) {
        const iconVb = parseViewBox(icon.iconContent);
        const icoBuffers: { pngData: ArrayBuffer; width: number; height: number }[] = [];

        for (const row of rows) {
          const targetSize = computeOutputSize(row, iconVb.w, iconVb.h);
          const fname = buildFilename(icon.iconName, row);

          if (row.format === 'svg') {
            // SVG: write raw content
            const dest = `${dirPath}/${fname}`;
            await electronAPI.writeFile(dest, icon.iconContent);
          } else if (row.format === 'pdf') {
            // PDF: rasterize then embed in PDF
            const pngBuf = await rasterizeSvgToArrayBuffer({
              svgContent: icon.iconContent,
              targetSize,
              format: 'png',
              quality: 100,
            });
            const pdfBuf = await buildPdfBuffer(pngBuf, targetSize, targetSize);
            const dest = `${dirPath}/${fname}`;
            await electronAPI.writeFile(dest, new Uint8Array(pdfBuf));
          } else if (row.format === 'ico') {
            if (showIcoMerge && icoMerge) {
              // Collect PNG buffers for merging later
              const pngBuf = await rasterizeSvgToArrayBuffer({
                svgContent: icon.iconContent,
                targetSize,
                format: 'png',
                quality: 100,
              });
              icoBuffers.push({ pngData: pngBuf, width: targetSize, height: targetSize });
            } else {
              // Single-size ICO
              const pngBuf = await rasterizeSvgToArrayBuffer({
                svgContent: icon.iconContent,
                targetSize,
                format: 'png',
                quality: 100,
              });
              const icoBuf = buildIcoBuffer([
                { pngData: pngBuf, width: targetSize, height: targetSize },
              ]);
              const dest = `${dirPath}/${fname}`;
              await electronAPI.writeFile(dest, new Uint8Array(icoBuf));
            }
          } else {
            // PNG, JPG, WebP
            const blob = await rasterizeSvgToBlob({
              svgContent: icon.iconContent,
              targetSize,
              format: row.format,
              quality,
              bgColor: row.format === 'jpg' ? bgColor : undefined,
            });
            const dest = `${dirPath}/${fname}`;
            const arrayBuf = await blob.arrayBuffer();
            await electronAPI.writeFile(dest, new Uint8Array(arrayBuf));
          }

          if (!(row.format === 'ico' && showIcoMerge && icoMerge)) {
            current++;
            setProgress({ current, total });
          }
        }

        // Write merged ICO
        if (icoBuffers.length > 0) {
          const icoBuf = buildIcoBuffer(icoBuffers);
          const fname = `${icon.iconName}.ico`;
          const dest = `${dirPath}/${fname}`;
          await electronAPI.writeFile(dest, new Uint8Array(icoBuf));
          current++;
          setProgress({ current, total });
        }
      }

      message.success(t('iconExport.done'));
      onClose();
    } catch (err: any) {
      message.error(t('iconExport.error', { error: err.message }));
    } finally {
      setExporting(false);
    }
  }, [
    rows,
    icons,
    isBatch,
    totalFiles,
    quality,
    bgColor,
    icoMerge,
    showIcoMerge,
    firstIcon,
    t,
    onClose,
  ]);

  // -- Reset on open ------------------------------------------
  const prevVisibleRef = React.useRef(false);
  if (visible && !prevVisibleRef.current) {
    // Fresh open: reset to default
    setRows([makeDefaultRow()]);
    setActivePreset(null);
    setExporting(false);
  }
  prevVisibleRef.current = visible;

  // -- Render -------------------------------------------------
  const title = isBatch
    ? t('iconExport.titleBatch', { count: icons.length })
    : t('iconExport.title');

  const footer = exporting ? null : (
    <>
      <Button onClick={onClose}>{t('iconExport.cancel')}</Button>
      <Button type="primary" onClick={handleExport} disabled={rows.length === 0}>
        {isBatch ? t('iconExport.exportAll') : t('iconExport.export')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={visible}
      onClose={onClose}
      title={title}
      footer={footer}
      maskClosable={!exporting}
      closable={!exporting}
      className="!max-w-xl"
    >
      {/* Preview */}
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border">
        {isBatch ? (
          <div className="relative w-20 h-20 shrink-0">
            {icons.slice(0, 3).map((icon, i) => (
              <div
                key={icon.id}
                className="absolute w-16 h-16 rounded-lg border border-border bg-surface flex items-center justify-center"
                style={{ top: i * 6, left: i * 6, zIndex: i }}
                dangerouslySetInnerHTML={{ __html: sanitizeSVG(icon.iconContent) }}
              />
            ))}
          </div>
        ) : firstIcon ? (
          <div
            className="w-20 h-20 shrink-0 rounded-lg border border-border flex items-center justify-center checkerboard"
            dangerouslySetInnerHTML={{ __html: sanitizeSVG(firstIcon.iconContent) }}
          />
        ) : null}
        <div>
          <div className="font-semibold text-foreground">
            {isBatch ? t('iconExport.titleBatch', { count: icons.length }) : firstIcon?.iconName}
          </div>
          {!isBatch && firstIcon && (
            <div className="text-xs text-foreground-muted mt-1">
              SVG &middot; {viewBox.w} &times; {viewBox.h}
            </div>
          )}
        </div>
      </div>

      {/* Presets */}
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1.5">
          {t('iconExport.presets')}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p)}
              className={cn(
                'px-3 py-1 rounded-md text-xs border transition-colors',
                activePreset === p.key
                  ? 'bg-accent/15 text-accent border-accent/30'
                  : 'bg-surface-muted/30 text-foreground-muted border-border/50 hover:border-accent/30'
              )}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Export Rows */}
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1.5">
          {t('iconExport.exportSettings')}
        </div>
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <ExportRow
              key={row.id}
              row={row}
              iconName={firstIcon?.iconName || 'icon'}
              viewBoxSize={Math.max(viewBox.w, viewBox.h)}
              onChange={handleRowChange}
              onDelete={handleRowDelete}
            />
          ))}
          <button
            onClick={handleAddRow}
            className={cn(
              'flex items-center justify-center gap-1 py-1.5',
              'border border-dashed border-border/50 rounded-lg',
              'text-xs text-foreground-muted hover:border-accent/30 hover:text-foreground',
              'transition-colors'
            )}
          >
            + {t('iconExport.addExport')}
          </button>
        </div>
      </div>

      {/* Format Settings -- conditional */}
      {hasJpgOrWebp && (
        <div className="mb-3 p-3 rounded-lg border border-border/50 bg-surface-muted/20">
          <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-2">
            {t('iconExport.formatSettings')}
          </div>
          {rows.some((r) => r.format === 'jpg') && (
            <div className="flex items-center gap-3 mb-2 text-sm text-foreground-muted">
              <span className="w-28 shrink-0">{t('iconExport.jpgBackground')}</span>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-6 h-6 rounded border border-border cursor-pointer"
              />
              <span className="text-xs font-mono text-foreground-muted">{bgColor}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm text-foreground-muted">
            <span className="w-28 shrink-0">{t('iconExport.quality')}</span>
            <Slider
              defaultValue={quality}
              min={10}
              max={100}
              onChange={setQuality}
              tooltip={{ formatter: (v) => `${v}%` }}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">{quality}%</span>
          </div>
        </div>
      )}

      {/* ICO Merge -- conditional */}
      {showIcoMerge && (
        <div className="mb-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <Checkbox checked={icoMerge} onChange={setIcoMerge}>
            <span className="text-sm text-amber-600 dark:text-amber-400">
              {t('iconExport.icoMerge')}
            </span>
          </Checkbox>
        </div>
      )}

      {/* Progress -- during export */}
      {exporting && (
        <div className="mb-3 text-sm text-foreground-muted">
          {t('iconExport.exporting', { current: progress.current, total: progress.total })}
          <div className="mt-1 h-1.5 bg-surface-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer info */}
      {!exporting && (
        <div className="text-xs text-foreground-muted pt-2 border-t border-border">
          {isBatch
            ? t('iconExport.fileSummaryBatch', {
                icons: icons.length,
                rows: rows.length,
                total: totalFiles,
              })
            : t('iconExport.fileSummary', { count: totalFiles })}
        </div>
      )}
    </Dialog>
  );
}
