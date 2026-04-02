import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Input } from '../ui';
import { Switch } from '../ui/switch';
import { message } from '../ui/toast';
import { confirm } from '../ui/dialog';
import { isnContainSpace } from '../../utils/tools';
import { cn } from '../../lib/utils';
import { getOption, setOption } from '../../config';
import type { OptionData } from '../../config';
import db from '../../database';
import useAppStore from '../../store';
import appIcon from '../../resources/imgs/icon.png';
import i18n from '../../i18n';
import { supportedLanguages } from '../../../locales';

interface SettingsDialogProps {
  visible: boolean;
  onClose: () => void;
}

function SettingsDialog({ visible, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  const [editingPrefixText, setEditingPrefixText] = useState<string | null>(null);
  const [editingPrefixErrText, setEditingPrefixErrText] = useState<string | null>(null);

  const opts = getOption() as OptionData;
  const [autoCheck, setAutoCheck] = useState(opts.autoCheckUpdate);
  const [autoDownload, setAutoDownload] = useState(opts.autoDownloadUpdate);
  const [channel, setChannel] = useState<'stable' | 'beta'>(opts.updateChannel);
  const themeMode = useAppStore((s: any) => s.themeMode);
  const setThemeMode = useAppStore((s: any) => s.setThemeMode);

  const syncPrefsToMain = (updates: Partial<OptionData>) => {
    setOption(updates);
    const current = getOption() as OptionData;
    (window as any).electronAPI.syncUpdatePreferences({
      autoCheckUpdate: current.autoCheckUpdate,
      autoDownloadUpdate: current.autoDownloadUpdate,
      updateChannel: current.updateChannel,
    });
  };

  // Reset state when dialog opens
  const prevVisibleRef = React.useRef(false);
  if (visible && !prevVisibleRef.current) {
    setEditingPrefixText(db.getProjectName());
    setEditingPrefixErrText(null);
  }
  prevVisibleRef.current = visible;

  const prefixChanged = editingPrefixText !== null && editingPrefixText !== db.getProjectName();

  const handleApplyPrefix = () => {
    if (isnContainSpace(editingPrefixText)) {
      confirm({
        title: t('prefix.confirmTitle'),
        content: t('prefix.confirmContent'),
        okText: t('prefix.confirmOk'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk() {
          db.setProjectName(editingPrefixText, () => {
            message.success(t('prefix.success'));
            syncLeft();
          });
        },
      });
    } else {
      setEditingPrefixErrText(t('prefix.emptyError'));
    }
  };

  const handleLanguageChange = (val: string) => {
    if (val === '__system__') {
      localStorage.removeItem('language');
      const sysLng = navigator.language.startsWith('zh') ? 'zh-CN' : navigator.language;
      i18n.changeLanguage(sysLng);
      (window as any).electronAPI.languageChanged(sysLng);
    } else {
      localStorage.setItem('language', val);
      i18n.changeLanguage(val);
      (window as any).electronAPI.languageChanged(val);
    }
  };

  return (
    <Dialog open={visible} onClose={onClose} title={t('settings.title')} footer={null}>
      <div className="space-y-5">
        {/* ── Language ──────────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.language')}
          </h4>
          <select
            value={localStorage.getItem('language') === null ? '__system__' : i18n.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className={cn(
              'w-full px-2.5 py-2 rounded-md text-sm',
              'border border-border bg-surface text-foreground',
              'focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30',
              'transition-colors duration-150',
              'cursor-pointer'
            )}
          >
            <option value="__system__">{t('settings.followSystem')}</option>
            {supportedLanguages.map((lng) => (
              <option key={lng.code} value={lng.code}>
                {lng.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-foreground-muted/50 mt-1.5 leading-relaxed">
            {t('settings.languageDesc')}
          </p>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Appearance ──────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.appearance')}
          </h4>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{t('settings.theme')}</span>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setThemeMode(mode)}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium transition-colors duration-100',
                    'flex items-center gap-1',
                    themeMode === mode
                      ? 'bg-brand-500 text-white'
                      : 'text-foreground-muted hover:bg-surface-accent'
                  )}
                >
                  {mode === 'light' && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2" />
                      <path d="M12 20v2" />
                      <path d="m4.93 4.93 1.41 1.41" />
                      <path d="m17.66 17.66 1.41 1.41" />
                      <path d="M2 12h2" />
                      <path d="M20 12h2" />
                      <path d="m6.34 17.66-1.41 1.41" />
                      <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                  )}
                  {mode === 'dark' && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                  )}
                  {mode === 'system' && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="20" height="14" x="2" y="3" rx="2" />
                      <line x1="8" x2="16" y1="21" y2="21" />
                      <line x1="12" x2="12" y1="17" y2="21" />
                    </svg>
                  )}
                  {t(`settings.theme.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Update ─────────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.update')}
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{t('settings.autoCheck')}</span>
              <Switch
                checked={autoCheck}
                onChange={(v) => {
                  setAutoCheck(v);
                  syncPrefsToMain({ autoCheckUpdate: v });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{t('settings.autoDownload')}</span>
              <Switch
                checked={autoDownload}
                onChange={(v) => {
                  setAutoDownload(v);
                  syncPrefsToMain({ autoDownloadUpdate: v });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{t('settings.channel')}</span>
              <select
                value={channel}
                onChange={(e) => {
                  const val = e.target.value as 'stable' | 'beta';
                  setChannel(val);
                  syncPrefsToMain({ updateChannel: val });
                  (window as any).electronAPI.setUpdateChannel(val);
                }}
                className={cn(
                  'px-2 py-1 rounded-md text-sm',
                  'border border-border bg-surface text-foreground',
                  'focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30',
                  'transition-colors duration-150',
                  'cursor-pointer'
                )}
              >
                <option value="stable">{t('settings.channelStable')}</option>
                <option value="beta">{t('settings.channelBeta')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Advanced ───────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-red-500/70 mb-2.5'
            )}
          >
            {t('settings.advanced')}
          </h4>
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <label className="block text-sm text-red-400 mb-1.5">{t('settings.prefix')}</label>
            <div className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder={t('prefix.placeholder')}
                value={editingPrefixText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEditingPrefixText(e.target.value);
                  setEditingPrefixErrText(null);
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
                    ? 'bg-red-500 text-white hover:bg-red-600 border border-red-500'
                    : 'bg-surface-muted text-foreground-muted border border-border'
                )}
              >
                {t('settings.prefixApply')}
              </button>
            </div>
            {editingPrefixErrText && (
              <p className="text-[11px] text-red-500 mt-1">{editingPrefixErrText}</p>
            )}
            <p className="text-[11px] text-red-400/50 mt-1.5 leading-relaxed">
              {t('settings.prefixDesc')}
            </p>
          </div>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Version ────────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.version')}
          </h4>
          <div className="flex items-center gap-2 text-sm text-foreground-muted">
            <img src={appIcon} alt="" className="h-4 w-4" />
            <span>
              Bobcorn v{__APP_VERSION__}
              <span className="mx-1.5 text-foreground-muted/30">·</span>
              <a
                href="https://bobcorn.caldis.me/"
                className="text-brand-500 hover:text-brand-600 transition-colors duration-150"
              >
                {t('settings.website')}
              </a>
            </span>
          </div>
        </section>
      </div>
    </Dialog>
  );
}

export default SettingsDialog;
