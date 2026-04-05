// src/renderer/components/IconExportDialog/ExportRow.tsx
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { buildFilename } from '../../utils/export/presets';
import type { ExportRowConfig, ExportFormat, SizeMode } from '../../utils/export/presets';

const FORMATS: ExportFormat[] = ['svg', 'png', 'jpg', 'webp', 'pdf', 'ico'];

interface ExportRowProps {
  row: ExportRowConfig;
  iconName: string;
  onChange: (id: string, updates: Partial<ExportRowConfig>) => void;
  onDelete: (id: string) => void;
}

export function ExportRow({ row, iconName, onChange, onDelete }: ExportRowProps) {
  const { t } = useTranslation();
  const isSvg = row.format === 'svg';

  const filename = useMemo(() => buildFilename(iconName, row), [iconName, row]);

  const handleSizeModeToggle = (mode: SizeMode) => {
    onChange(row.id, { sizeMode: mode });
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val)) return;
    if (row.sizeMode === 'scale') {
      onChange(row.id, { scale: Math.max(0.5, Math.min(4, val)) });
    } else {
      onChange(row.id, { pixelSize: Math.max(1, Math.min(4096, Math.round(val))) });
    }
  };

  const handleStep = (delta: number) => {
    if (row.sizeMode === 'scale') {
      const next = Math.max(0.5, Math.min(4, row.scale + delta));
      onChange(row.id, { scale: next });
    } else {
      const next = Math.max(1, Math.min(4096, Math.round(row.pixelSize + delta)));
      onChange(row.id, { pixelSize: next });
    }
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(row.id, { format: e.target.value as ExportFormat });
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        'bg-surface-muted/30 rounded-lg border border-border/50'
      )}
    >
      {/* @/px toggle */}
      <div className="flex bg-surface-accent rounded overflow-hidden shrink-0">
        <button
          className={cn(
            'px-2 py-0.5 text-xs transition-colors',
            row.sizeMode === 'scale'
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground-muted hover:text-foreground'
          )}
          onClick={() => handleSizeModeToggle('scale')}
          disabled={isSvg}
        >
          @
        </button>
        <button
          className={cn(
            'px-2 py-0.5 text-xs transition-colors',
            row.sizeMode === 'pixel'
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground-muted hover:text-foreground'
          )}
          onClick={() => handleSizeModeToggle('pixel')}
          disabled={isSvg}
        >
          px
        </button>
      </div>

      {/* Size value with stepper */}
      <div
        className={cn(
          'flex items-center rounded border border-border bg-surface overflow-hidden shrink-0',
          'focus-within:border-accent focus-within:ring-1 focus-within:ring-ring/30',
          'transition-colors duration-200',
          isSvg && 'opacity-40 cursor-not-allowed'
        )}
      >
        <input
          type="text"
          inputMode="decimal"
          value={isSvg ? '—' : row.sizeMode === 'scale' ? row.scale : row.pixelSize}
          onChange={handleSizeChange}
          onKeyDown={(e) => {
            if (isSvg) return;
            const step = row.sizeMode === 'scale' ? 0.5 : 1;
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              handleStep(step);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              handleStep(-step);
            }
          }}
          disabled={isSvg}
          className={cn(
            'w-14 px-2 py-1 text-center text-sm bg-transparent text-foreground outline-none',
            '[appearance:textfield]',
            isSvg && 'cursor-not-allowed'
          )}
        />
        <div className="flex flex-col border-l border-border">
          <button
            type="button"
            onClick={() => handleStep(row.sizeMode === 'scale' ? 0.5 : 1)}
            disabled={isSvg}
            className="px-1 h-3.5 flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-surface-muted transition-colors"
          >
            <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor">
              <path d="M4 0L7.5 4.5H0.5L4 0Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleStep(row.sizeMode === 'scale' ? -0.5 : -1)}
            disabled={isSvg}
            className="px-1 h-3.5 flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-surface-muted border-t border-border transition-colors"
          >
            <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor">
              <path d="M4 5L0.5 0.5H7.5L4 5Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Format dropdown */}
      <select
        value={row.format}
        onChange={handleFormatChange}
        className={cn(
          'px-2 py-1 text-sm rounded border border-border bg-surface text-foreground',
          'focus:border-accent focus:ring-1 focus:ring-ring/30 outline-none',
          'min-w-[72px]'
        )}
      >
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f.toUpperCase()}
          </option>
        ))}
      </select>

      {/* Filename preview with middle truncation */}
      <span className="flex-1 min-w-0 relative group">
        <span className="block text-xs text-foreground-muted font-mono truncate-middle">
          {(() => {
            const maxLen = 28;
            if (filename.length <= maxLen) return filename;
            const keepEnd = 16; // keep suffix like @3x.png visible
            const keepStart = maxLen - keepEnd - 3; // 3 for "..."
            return filename.slice(0, keepStart) + '...' + filename.slice(-keepEnd);
          })()}
        </span>
        {/* Tooltip on hover showing full filename */}
        {filename.length > 28 && (
          <span
            className={cn(
              'absolute bottom-full left-1/2 -translate-x-1/2 mb-1',
              'px-2 py-1 rounded text-xs',
              'bg-foreground text-surface',
              'whitespace-nowrap pointer-events-none',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'z-50'
            )}
          >
            {filename}
          </span>
        )}
      </span>

      {/* Delete */}
      <button
        onClick={() => onDelete(row.id)}
        className="shrink-0 text-foreground-muted hover:text-foreground transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
