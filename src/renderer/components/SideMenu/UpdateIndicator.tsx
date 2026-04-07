import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store';
import { confirm } from '../ui/dialog';
import { cn } from '../../lib/utils';

const { electronAPI } = window;

const CHANGELOG_URL = 'https://bobcorn.caldis.me/changelog.json';

interface ChangelogEntry {
  version: string;
  date: string;
  summary?: { zh: string; en: string };
  changes?: { zh: string[]; en: string[] };
}

function UpdateIndicator({ onInstall }: { onInstall: () => void }) {
  const { t, i18n } = useTranslation();
  const status = useAppStore((s) => s.updateStatus);
  const version = useAppStore((s) => s.updateVersion);
  const progress = useAppStore((s) => s.updateProgress);
  const error = useAppStore((s) => s.updateError);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [changelogEntry, setChangelogEntry] = useState<ChangelogEntry | null>(null);

  // Single-round pulse: remove animation class after one cycle
  useEffect(() => {
    if (status !== 'available' || !pulseRef.current) return;
    const el = pulseRef.current;
    const handler = () => el.classList.remove('animate-pulse');
    el.addEventListener('animationiteration', handler, { once: true });
    return () => el.removeEventListener('animationiteration', handler);
  }, [status]);

  // Fetch changelog entry for the target version from the website
  useEffect(() => {
    if (!version || (status !== 'available' && status !== 'downloaded')) {
      setChangelogEntry(null);
      return;
    }
    fetch(CHANGELOG_URL, { cache: 'no-cache' })
      .then((r) => r.json())
      .then((entries: ChangelogEntry[]) => {
        const match = entries.find((e) => e.version === version);
        if (match) setChangelogEntry(match);
      })
      .catch(() => {});
  }, [version, status]);

  if (status === 'idle') return null;

  const isClickable = status === 'available' || status === 'downloaded' || status === 'error';

  const handleClick = () => {
    if (status === 'available') {
      electronAPI.downloadUpdate();
    } else if (status === 'downloaded') {
      onInstall();
    } else if (status === 'error') {
      electronAPI.checkForUpdate();
    }
  };

  const handleCancelDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    confirm({
      title: t('update.cancelTitle'),
      content: t('update.cancelContent'),
      okText: t('update.cancelConfirm'),
      okType: 'danger',
      dangerText: t('update.goToWebsite'),
      onOk: () => {
        useAppStore.getState().setUpdateStatus('idle');
      },
      onDanger: () => {
        useAppStore.getState().setUpdateStatus('idle');
        electronAPI.openExternal('https://bobcorn.caldis.me/');
      },
    });
  };

  const showHoverCard = status === 'downloaded' || status === 'available';

  const handleMouseEnter = () => {
    if (!showHoverCard) return;
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoverCard(true), 300);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoverCard(false), 200);
  };

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={isClickable ? handleClick : undefined}
        title={status === 'error' && error ? error : undefined}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
          'text-[11px] text-foreground-muted',
          'transition-colors duration-150',
          isClickable && 'cursor-pointer hover:bg-surface-accent hover:text-foreground',
          !isClickable && 'cursor-default'
        )}
      >
        {/* Status dot */}
        {status === 'available' && (
          <span
            ref={pulseRef}
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
          />
        )}
        {status === 'downloaded' && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        )}
        {status === 'error' && <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />}

        {/* Progress bar for downloading */}
        {status === 'downloading' && (
          <span className="inline-block w-12 h-0.5 rounded-full bg-surface-accent overflow-hidden">
            <span
              className="block h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </span>
        )}

        {/* Label */}
        <span>
          {status === 'checking' && t('update.checking')}
          {status === 'available' && t('update.available', { version: `v${version}` })}
          {status === 'downloading' && t('update.downloading', { percent: progress })}
          {status === 'downloaded' && t('update.downloaded', { version: `v${version}` })}
          {status === 'error' && t('update.error')}
        </span>
      </button>

      {/* Cancel button for downloading state */}
      {status === 'downloading' && (
        <button
          onClick={handleCancelDownload}
          title={t('update.cancelTooltip')}
          className={cn(
            'inline-flex items-center justify-center',
            'h-4 w-4 rounded-full',
            'text-foreground-muted/50 hover:text-foreground-muted hover:bg-surface-accent',
            'transition-colors duration-100'
          )}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {/* Hover card — version + release notes preview */}
      {hoverCard && showHoverCard && (
        <div
          className={cn(
            'absolute bottom-full right-0 mb-2 z-50',
            'w-[240px] rounded-lg',
            'border border-border bg-surface shadow-lg',
            'overflow-hidden',
            'animate-in fade-in slide-in-from-bottom-1 duration-150'
          )}
          onMouseEnter={() => {
            clearTimeout(hoverTimeout.current);
          }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-xs font-medium text-foreground">v{version}</span>
              {status === 'downloaded' && (
                <span className="text-[10px] text-success font-medium ml-auto">
                  {t('update.readyBadge')}
                </span>
              )}
              {status === 'available' && (
                <span className="text-[10px] text-accent font-medium ml-auto">
                  {t('update.newBadge')}
                </span>
              )}
            </div>
          </div>

          {/* Release notes from changelog.json */}
          {changelogEntry ? (
            <div className="px-3 pb-3">
              {/* Summary line */}
              {changelogEntry.summary && (
                <p className="text-[11px] text-foreground-muted leading-relaxed mb-1.5">
                  {i18n.language.startsWith('zh')
                    ? changelogEntry.summary.zh
                    : changelogEntry.summary.en}
                </p>
              )}
              {/* Change items */}
              {changelogEntry.changes && (
                <ul className="text-[11px] text-foreground-muted/70 leading-relaxed list-disc pl-3.5 space-y-0.5">
                  {(i18n.language.startsWith('zh')
                    ? changelogEntry.changes.zh
                    : changelogEntry.changes.en
                  ).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="px-3 pb-3">
              <p className="text-[11px] text-foreground-muted/40 italic">
                {t('update.noChangelog')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(UpdateIndicator);
