import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, FolderOpen } from 'lucide-react';
import { Dialog, Input } from '../ui';
import { message } from '../ui/toast';
import { confirm } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { isnContainSpace } from '../../utils/tools';
import { getFileDisplayName } from '../../hooks/useRecentProjects';
import { ProjectAvatar, AVATAR_COLORS } from '../ProjectItem';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.settings
import db from '../../database';
import useAppStore from '../../store';

const { electronAPI } = window;

interface ProjectSettingsDialogProps {
  visible: boolean;
  onClose: () => void;
}

function ProjectSettingsDialog({ visible, onClose }: ProjectSettingsDialogProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((s: any) => s.syncLeft);
  const syncProjectMeta = useAppStore((s: any) => s.syncProjectMeta);
  const currentFilePath = useAppStore((s: any) => s.currentFilePath);
  const projectName = useAppStore((s: any) => s.projectName);

  // ── Editable state ──────────────────────────────────────────────
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // ── Font prefix state (migrated from SettingsDialog) ────────────
  const [prefixText, setPrefixText] = useState('');
  const [prefixErr, setPrefixErr] = useState<string | null>(null);

  // ── Stats ───────────────────────────────────────────────────────
  const [stats, setStats] = useState<{
    iconCount: number;
    groupCount: number;
    createTime: string | null;
    updateTime: string | null;
  }>({ iconCount: 0, groupCount: 0, createTime: null, updateTime: null });

  // Reset state when dialog opens
  useEffect(() => {
    if (!visible) return;
    setDescription((db as any).getProjectDescription?.() || '');
    setSelectedColor((db as any).getProjectColor?.() || null);
    setPrefixText((db as any).getProjectName() || 'iconfont');
    setPrefixErr(null);
    try {
      setStats((db as any).getProjectStats());
    } catch {
      /* db may not be ready */
    }
  }, [visible]);

  // ── Identity handlers ───────────────────────────────────────────

  const handleDescBlur = useCallback(() => {
    const val = description.trim() || null;
    (db as any).setProjectDescription(val, () => syncProjectMeta());
  }, [description, syncProjectMeta]);

  const handleColorSelect = useCallback(
    (color: string | null) => {
      setSelectedColor(color);
      (db as any).setProjectColor(color, () => syncProjectMeta());
    },
    [syncProjectMeta]
  );

  // ── Prefix handler (migrated from SettingsDialog) ───────────────

  const prefixChanged = prefixText !== (db as any).getProjectName();

  const handleApplyPrefix = useCallback(() => {
    if (isnContainSpace(prefixText)) {
      confirm({
        title: t('prefix.confirmTitle'),
        content: t('prefix.confirmContent'),
        okText: t('prefix.confirmOk'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk() {
          (db as any).setProjectName(prefixText, () => {
            message.success(t('prefix.success'));
            syncLeft();
          });
        },
      });
    } else {
      setPrefixErr(t('prefix.emptyError'));
    }
  }, [prefixText, syncLeft, t]);

  // ── File path actions ───────────────────────────────────────────

  const handleCopyPath = useCallback(() => {
    if (currentFilePath) {
      navigator.clipboard.writeText(currentFilePath);
      message.success(t('projectSettings.pathCopied'));
    }
  }, [currentFilePath, t]);

  const handleShowInFolder = useCallback(() => {
    if (currentFilePath) {
      const dir = electronAPI.pathDirname(currentFilePath);
      electronAPI.openPath(dir);
    }
  }, [currentFilePath]);

  const handleSaveAs = useCallback(() => {
    onClose();
    window.dispatchEvent(new CustomEvent('bobcorn:save-as'));
  }, [onClose]);

  // ── Derived display ─────────────────────────────────────────────

  const displayName = currentFilePath ? getFileDisplayName(currentFilePath) : projectName;

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <Dialog open={visible} onClose={onClose} title={t('projectSettings.title')} footer={null}>
      <div className="space-y-5">
        {/* ── Identity ─────────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-3'
            )}
          >
            {t('projectSettings.identity')}
          </h4>

          {/* Avatar + Name */}
          <div className="flex items-center gap-3 mb-3">
            <ProjectAvatar name={displayName} size={36} color={selectedColor} />
            <span
              className="text-sm font-medium text-foreground truncate"
              title={t('projectSettings.nameHint')}
            >
              {displayName}
            </span>
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescBlur}
            placeholder={t('projectSettings.descPlaceholder')}
            rows={2}
            className={cn(
              'w-full px-2.5 py-2 rounded-md text-sm resize-none mb-3',
              'border border-border bg-surface text-foreground',
              'placeholder:text-foreground-muted/40',
              'focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring/30',
              'transition-colors duration-150'
            )}
          />

          {/* Color palette */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-foreground-muted/50 shrink-0">
              {t('projectSettings.color')}
            </span>
            <div className="flex items-center gap-1.5">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className={cn(
                    'w-5 h-5 rounded-full transition-all duration-100',
                    selectedColor === color
                      ? 'ring-2 ring-offset-2 ring-offset-surface scale-110'
                      : 'hover:scale-110'
                  )}
                  style={{
                    backgroundColor: color,
                    ...(selectedColor === color ? { ringColor: color } : {}),
                  }}
                />
              ))}
              {/* Auto / reset */}
              <button
                onClick={() => handleColorSelect(null)}
                className={cn(
                  'h-5 px-1.5 rounded-full text-[10px] font-medium',
                  'border transition-all duration-100',
                  selectedColor === null
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-foreground-muted/50 hover:text-foreground-muted'
                )}
              >
                {t('projectSettings.colorAuto')}
              </button>
            </div>
          </div>
        </section>

        {/* ── Divider ──────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Font Prefix ──────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-danger/70 mb-2.5'
            )}
          >
            {t('projectSettings.fontPrefix')}
          </h4>
          <div className="rounded-md border border-danger/20 bg-danger-subtle p-3">
            <div className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder={t('prefix.placeholder')}
                value={prefixText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setPrefixText(e.target.value);
                  setPrefixErr(null);
                }}
                onPressEnter={prefixChanged ? handleApplyPrefix : undefined}
              />
              <button
                disabled={!prefixChanged}
                onClick={handleApplyPrefix}
                className={cn(
                  'shrink-0 h-8 px-3 rounded-md text-sm font-medium',
                  'transition-colors duration-150',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  prefixChanged
                    ? 'bg-danger text-accent-foreground hover:bg-danger/90 border border-danger'
                    : 'bg-surface-muted text-foreground-muted border border-border'
                )}
              >
                {t('settings.prefixApply')}
              </button>
            </div>
            {prefixErr && <p className="text-[11px] text-danger mt-1">{prefixErr}</p>}
            <p className="text-[11px] text-danger/50 mt-1.5 leading-relaxed">
              {t('settings.prefixDesc')}
            </p>
          </div>
        </section>

        {/* ── Divider ──────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Project Info ─────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('projectSettings.info')}
          </h4>
          <div className="space-y-2 text-sm">
            {/* File path */}
            <div className="flex items-start gap-2">
              <span className="text-foreground-muted/50 shrink-0 w-16 text-[12px] pt-0.5">
                {t('projectSettings.filePath')}
              </span>
              {currentFilePath ? (
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span
                    className="text-[12px] text-foreground-muted truncate flex-1"
                    title={currentFilePath}
                  >
                    {currentFilePath}
                  </span>
                  <button
                    onClick={handleCopyPath}
                    className={cn(
                      'shrink-0 p-1 rounded text-foreground-muted/40',
                      'hover:text-foreground-muted hover:bg-surface-accent',
                      'transition-colors duration-100'
                    )}
                    title={t('projectSettings.copyPath')}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={handleShowInFolder}
                    className={cn(
                      'shrink-0 p-1 rounded text-foreground-muted/40',
                      'hover:text-foreground-muted hover:bg-surface-accent',
                      'transition-colors duration-100'
                    )}
                    title={t('projectSettings.showInFolder')}
                  >
                    <FolderOpen size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-foreground-muted/40 italic">
                    {t('projectSettings.unsaved')}
                  </span>
                  <button
                    onClick={handleSaveAs}
                    className={cn(
                      'text-[11px] px-2 py-0.5 rounded',
                      'text-accent hover:bg-accent/10',
                      'transition-colors duration-100'
                    )}
                  >
                    {t('projectSettings.saveAs')}
                  </button>
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted/50 shrink-0 w-16 text-[12px]" />
              <span className="text-[12px] text-foreground-muted">
                {stats.iconCount} {t('projectSettings.icons')}
                <span className="mx-1.5 text-foreground-muted/30">·</span>
                {stats.groupCount} {t('projectSettings.groups')}
              </span>
            </div>

            {/* Dates */}
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted/50 shrink-0 w-16 text-[12px]">
                {t('projectSettings.created')}
              </span>
              <span className="text-[12px] text-foreground-muted">
                {formatDate(stats.createTime)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted/50 shrink-0 w-16 text-[12px]">
                {t('projectSettings.modified')}
              </span>
              <span className="text-[12px] text-foreground-muted">
                {formatDate(stats.updateTime)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </Dialog>
  );
}

export default ProjectSettingsDialog;
