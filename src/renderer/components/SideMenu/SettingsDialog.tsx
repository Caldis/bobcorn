import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui';
import { Switch } from '../ui/switch';
import { message } from '../ui/toast';
import { cn } from '../../lib/utils';
import { getOption, setOption } from '../../config';
import type { OptionData } from '../../config';
import useAppStore from '../../store';
import appIcon from '../../resources/imgs/icon.png';
import i18n from '../../i18n';
import { supportedLanguages } from '../../../locales';

/** Wiki language mapping — maps i18n language code to wiki path segment */
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

interface SettingsDialogProps {
  visible: boolean;
  onClose: () => void;
}

function SettingsDialog({ visible, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();

  const opts = getOption() as OptionData;
  const [autoCheck, setAutoCheck] = useState(opts.autoCheckUpdate);
  const [autoDownload, setAutoDownload] = useState(opts.autoDownloadUpdate);
  const [channel, setChannel] = useState<'stable' | 'beta'>(opts.updateChannel);
  const themeMode = useAppStore((s: any) => s.themeMode);
  const setThemeMode = useAppStore((s: any) => s.setThemeMode);
  const analyticsBasic = useAppStore((s: any) => s.analyticsBasicEnabled);
  const analyticsDetailed = useAppStore((s: any) => s.analyticsDetailedEnabled);
  const setAnalyticsConsent = useAppStore((s: any) => s.setAnalyticsConsent);

  // CLI status
  const [cliStatus, setCliStatus] = useState<'checking' | 'installed' | 'not-installed'>(
    'checking'
  );
  const [cliVersion, setCliVersion] = useState<string | null>(null);
  const [cliCommandName, setCliCommandName] = useState<string>('bobcorn');
  const [cliActionPending, setCliActionPending] = useState(false);
  const [cliShowRestartHint, setCliShowRestartHint] = useState(false);

  const detectCliStatus = useCallback(async () => {
    setCliStatus('checking');
    try {
      const result = await (window as any).electronAPI.cliDetectStatus();
      if (result.commandName) setCliCommandName(result.commandName);
      if (result.installed) {
        setCliStatus('installed');
        setCliVersion(result.version);
      } else {
        setCliStatus('not-installed');
        setCliVersion(null);
      }
    } catch {
      setCliStatus('not-installed');
      setCliVersion(null);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      detectCliStatus();
      setCliShowRestartHint(false);
    }
  }, [visible, detectCliStatus]);

  const handleCliInstall = async () => {
    setCliActionPending(true);
    try {
      const result = await (window as any).electronAPI.cliInstall();
      if (result.success) {
        if (result.commandName) setCliCommandName(result.commandName);
        message.success(t('settings.cli.installSuccess'));
        setCliShowRestartHint(true);
        await detectCliStatus();
      } else {
        message.error(t('settings.cli.installError', { error: result.message }));
      }
    } catch (err: any) {
      message.error(t('settings.cli.installError', { error: err.message }));
    } finally {
      setCliActionPending(false);
    }
  };

  const handleCliUninstall = async () => {
    setCliActionPending(true);
    try {
      const result = await (window as any).electronAPI.cliUninstall();
      if (result.success) {
        setCliShowRestartHint(false);
        await detectCliStatus();
      }
    } catch {
      // Silently handle errors
    } finally {
      setCliActionPending(false);
    }
  };

  const syncPrefsToMain = (updates: Partial<OptionData>) => {
    setOption(updates);
    const current = getOption() as OptionData;
    (window as any).electronAPI.syncUpdatePreferences({
      autoCheckUpdate: current.autoCheckUpdate,
      autoDownloadUpdate: current.autoDownloadUpdate,
      updateChannel: current.updateChannel,
    });
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
              'focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring/30',
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
                      ? 'bg-accent text-accent-foreground'
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
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                {(['stable', 'beta'] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => {
                      setChannel(ch);
                      syncPrefsToMain({ updateChannel: ch });
                      (window as any).electronAPI.setUpdateChannel(ch);
                    }}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium transition-colors duration-100',
                      channel === ch
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground-muted hover:bg-surface-accent'
                    )}
                  >
                    {t(`settings.channel${ch.charAt(0).toUpperCase() + ch.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-foreground">{t('settings.checkNow')}</span>
              <button
                onClick={() => {
                  // Listen for result once, then clean up
                  const cleanups: (() => void)[] = [];
                  const cleanup = () => cleanups.forEach((fn) => fn());
                  cleanups.push(
                    (window as any).electronAPI.onUpdateAvailable(() => {
                      cleanup();
                      message.success(t('update.foundNewVersion'));
                      onClose();
                    })
                  );
                  cleanups.push(
                    (window as any).electronAPI.onUpdateNotAvailable(() => {
                      cleanup();
                      message.info(t('update.alreadyLatest'));
                    })
                  );
                  cleanups.push(
                    (window as any).electronAPI.onUpdateError(() => {
                      cleanup();
                      message.error(t('update.checkFailed'));
                    })
                  );
                  (window as any).electronAPI.checkForUpdate();
                }}
                className={cn(
                  'px-3 py-1 rounded-md text-[11px] font-medium',
                  'border border-border text-foreground-muted',
                  'hover:bg-surface-accent hover:text-foreground',
                  'transition-colors duration-150'
                )}
              >
                {t('settings.checkNowBtn')}
              </button>
            </div>
          </div>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Command Line Interface ─────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.cli.title')}
          </h4>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded',
                  'bg-foreground/[0.04] border border-foreground/[0.06]'
                )}
              >
                <span className="text-accent/60 text-xs font-mono select-none">$</span>
                <code className="text-sm text-foreground font-mono">{cliCommandName}</code>
              </span>
              {cliStatus === 'checking' && (
                <span className="inline-block w-3 h-3 border-[1.5px] border-foreground-muted/30 border-t-foreground-muted/60 rounded-full animate-spin shrink-0" />
              )}
              {cliStatus === 'installed' && (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                    'bg-accent/10 text-accent'
                  )}
                >
                  v{cliVersion}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <a
                href={`https://bobcorn.caldis.me/wiki/${WIKI_LANG_MAP[i18n.language] || 'en'}/cli-setup.html`}
                onClick={(e) => {
                  e.preventDefault();
                  const lang = WIKI_LANG_MAP[i18n.language] || 'en';
                  (window as any).electronAPI.openExternal(
                    `https://bobcorn.caldis.me/wiki/${lang}/cli-setup.html`
                  );
                }}
                className="text-[11px] text-foreground-muted/30 hover:text-foreground-muted/60 transition-colors duration-150 cursor-pointer"
              >
                {t('settings.cli.manualSetup')}
              </a>
              {cliStatus === 'installed' ? (
                <button
                  disabled={cliActionPending}
                  onClick={handleCliUninstall}
                  className={cn(
                    'px-3 py-1 rounded-md text-[11px] font-medium',
                    'border border-border text-foreground-muted',
                    'hover:bg-surface-accent hover:text-foreground',
                    'transition-colors duration-150',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {cliActionPending ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      {t('settings.cli.uninstalling')}
                    </span>
                  ) : (
                    t('settings.cli.uninstall')
                  )}
                </button>
              ) : cliStatus === 'not-installed' ? (
                <button
                  disabled={cliActionPending}
                  onClick={handleCliInstall}
                  className={cn(
                    'px-3 py-1 rounded-md text-[11px] font-medium',
                    'bg-accent text-accent-foreground',
                    'hover:bg-accent/90',
                    'transition-colors duration-150',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {cliActionPending ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      {t('settings.cli.installing')}
                    </span>
                  ) : (
                    t('settings.cli.install')
                  )}
                </button>
              ) : null}
            </div>
          </div>
          <p className="text-[11px] text-foreground-muted/40 mt-1">
            {t('settings.cli.description')}
          </p>
          {/* Usage guide — prominent, own line */}
          <a
            href={`https://bobcorn.caldis.me/wiki/${WIKI_LANG_MAP[i18n.language] || 'en'}/cli.html`}
            onClick={(e) => {
              e.preventDefault();
              const lang = WIKI_LANG_MAP[i18n.language] || 'en';
              (window as any).electronAPI.openExternal(
                `https://bobcorn.caldis.me/wiki/${lang}/cli.html`
              );
            }}
            className={cn(
              'flex items-center justify-between mt-2 px-3 py-2 rounded-md cursor-pointer',
              'bg-accent/[0.06] border border-accent/10',
              'hover:bg-accent/10 transition-colors duration-150 group/docs'
            )}
          >
            <span className="text-[12px] text-foreground/80 group-hover/docs:text-foreground transition-colors">
              {t('settings.cli.docs')}
            </span>
            <span className="text-accent/60 group-hover/docs:text-accent transition-colors text-xs">
              &rarr;
            </span>
          </a>
          {cliShowRestartHint && (
            <p className="text-[11px] text-accent/70 mt-1.5">
              {t('settings.cli.restartHint', { command: cliCommandName })}
            </p>
          )}
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Bobcorn AI ────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.ai.title')}
          </h4>
          <div
            className={cn(
              'rounded-lg p-3',
              'bg-gradient-to-br from-violet-500/[0.06] to-fuchsia-500/[0.04]',
              'border border-violet-500/10'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-foreground-muted/50">
                {t('settings.ai.description')}
              </span>
              <span
                className={cn(
                  'text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0 ml-2',
                  'bg-violet-500/10 text-violet-500 dark:text-violet-400',
                  'border border-violet-500/15'
                )}
              >
                {t('settings.ai.comingSoon')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  'smartGrouping',
                  'nameNormalization',
                  'duplicateDetection',
                  'iconGeneration',
                  'styleCheck',
                  'setCompletion',
                  'a11yDescriptions',
                  'smartUnicode',
                  'variantIntelligence',
                ] as const
              ).map((name) => (
                <span
                  key={name}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full',
                    'bg-foreground/[0.04] text-foreground-muted/50',
                    'border border-foreground/[0.04]'
                  )}
                >
                  {t(`settings.ai.${name}`)}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Data Sharing ──────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.analytics')}
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <span className="text-sm text-foreground">{t('settings.analyticsBasic')}</span>
                <p className="text-xs text-foreground-muted/50 mt-0.5">
                  {t('settings.analyticsBasicHint')}
                </p>
              </div>
              <Switch
                checked={analyticsBasic}
                onChange={(v) => setAnalyticsConsent(v, analyticsDetailed)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <span className="text-sm text-foreground">{t('settings.analyticsDetailed')}</span>
                <p className="text-xs text-foreground-muted/50 mt-0.5">
                  {t('settings.analyticsDetailedHint')}
                </p>
              </div>
              <Switch
                checked={analyticsDetailed}
                onChange={(v) => setAnalyticsConsent(analyticsBasic, v)}
              />
            </div>
            <p className="text-xs text-foreground-muted/50 pt-1">
              {t('settings.analyticsFooter')}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  (window as any).electronAPI.openExternal(
                    'https://bobcorn.caldis.me/privacy.html'
                  );
                }}
                className="text-accent hover:text-accent/80 transition-colors duration-150 cursor-pointer"
              >
                {t('settings.privacyPolicy')}
              </a>
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
                onClick={(e) => {
                  e.preventDefault();
                  (window as any).electronAPI.openExternal('https://bobcorn.caldis.me/');
                }}
                className="text-accent hover:text-accent/80 transition-colors duration-150 cursor-pointer"
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
