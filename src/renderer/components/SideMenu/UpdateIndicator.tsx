import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store';
import { confirm } from '../ui/dialog';
import { cn } from '../../lib/utils';

const { electronAPI } = window;

function UpdateIndicator({ onInstall }: { onInstall: () => void }) {
  const { t } = useTranslation();
  const status = useAppStore((s) => s.updateStatus);
  const version = useAppStore((s) => s.updateVersion);
  const progress = useAppStore((s) => s.updateProgress);
  const pulseRef = useRef<HTMLSpanElement>(null);

  // Single-round pulse: remove animation class after one cycle
  useEffect(() => {
    if (status !== 'available' || !pulseRef.current) return;
    const el = pulseRef.current;
    const handler = () => {
      el.classList.remove('animate-pulse');
    };
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

  const tooltip =
    status === 'available'
      ? t('update.downloadTooltip')
      : status === 'downloaded'
        ? t('update.installTooltip')
        : status === 'error'
          ? t('update.retryTooltip')
          : undefined;

  return (
    <div className="inline-flex items-center">
      <button
        onClick={isClickable ? handleClick : undefined}
        title={tooltip}
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
    </div>
  );
}

export default React.memo(UpdateIndicator);
