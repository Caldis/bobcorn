import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store';
import { confirm } from '../ui/dialog';
import { cn } from '../../lib/utils';

const { electronAPI } = window;

function UpdateIndicator({ onInstall }: { onInstall: () => void }) {
  const { t } = useTranslation();
  const status = useAppStore((s) => s.updateStatus);
  const version = useAppStore((s) => s.updateVersion);
  const releaseNotes = useAppStore((s) => s.updateReleaseNotes);
  const progress = useAppStore((s) => s.updateProgress);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Single-round pulse: remove animation class after one cycle
  useEffect(() => {
    if (status !== 'available' || !pulseRef.current) return;
    const el = pulseRef.current;
    const handler = () => el.classList.remove('animate-pulse');
    el.addEventListener('animationiteration', handler, { once: true });
    return () => el.removeEventListener('animationiteration', handler);
  }, [status]);

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

  // Strip HTML tags from release notes for plain text display
  const plainNotes = releaseNotes
    ? releaseNotes
        .replace(/<[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : null;

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={isClickable ? handleClick : undefined}
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
            className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse"
          />
        )}
        {status === 'downloaded' && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
        {status === 'error' && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
        )}

        {/* Progress bar for downloading */}
        {status === 'downloading' && (
          <span className="inline-block w-12 h-0.5 rounded-full bg-surface-accent overflow-hidden">
            <span
              className="block h-full bg-brand-500 transition-all duration-300 ease-out"
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
            'absolute bottom-full left-0 mb-2 z-50',
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
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-foreground">v{version}</span>
              {status === 'downloaded' && (
                <span className="text-[10px] text-emerald-500 font-medium ml-auto">
                  {t('update.readyBadge')}
                </span>
              )}
              {status === 'available' && (
                <span className="text-[10px] text-brand-500 font-medium ml-auto">
                  {t('update.newBadge')}
                </span>
              )}
            </div>
          </div>

          {/* Release notes */}
          {plainNotes ? (
            <div className="px-3 pb-3">
              <div className="text-[10px] text-foreground-muted/60 uppercase tracking-wide font-medium mb-1">
                {t('update.changelog')}
              </div>
              <p className="text-[11px] text-foreground-muted leading-relaxed line-clamp-4 whitespace-pre-line">
                {plainNotes}
              </p>
            </div>
          ) : (
            <div className="px-3 pb-3">
              <p className="text-[11px] text-foreground-muted/40 italic">
                {t('update.noChangelog')}
              </p>
            </div>
          )}

          {/* Footer action hint */}
          <div className="px-3 py-1.5 border-t border-border bg-surface-muted/50">
            <p className="text-[10px] text-foreground-muted/50 text-center">
              {status === 'downloaded' ? t('update.clickToRelaunch') : t('update.clickToDownload')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(UpdateIndicator);
