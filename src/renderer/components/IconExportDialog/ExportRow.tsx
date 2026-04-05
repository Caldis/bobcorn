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
    const val = parseFloat(e.target.value) || 0;
    if (row.sizeMode === 'scale') {
      onChange(row.id, { scale: Math.max(0.5, Math.min(4, val)) });
    } else {
      onChange(row.id, { pixelSize: Math.max(1, Math.min(4096, Math.round(val))) });
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

      {/* Size value */}
      <input
        type="number"
        step={row.sizeMode === 'scale' ? 0.5 : 1}
        min={row.sizeMode === 'scale' ? 0.5 : 1}
        max={row.sizeMode === 'scale' ? 4 : 4096}
        value={isSvg ? '' : row.sizeMode === 'scale' ? row.scale : row.pixelSize}
        onChange={handleSizeChange}
        disabled={isSvg}
        className={cn(
          'w-16 px-2 py-1 text-center text-sm rounded border border-border bg-surface',
          'focus:border-accent focus:ring-1 focus:ring-ring/30 outline-none',
          isSvg && 'opacity-40 cursor-not-allowed'
        )}
        placeholder={isSvg ? '\u2014' : undefined}
      />

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

      {/* Filename preview */}
      <span
        className={cn('flex-1 text-xs text-foreground-muted font-mono', 'truncate')}
        title={filename}
      >
        {filename}
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
