import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui';
import { cn } from '../../lib/utils';
import useAppStore from '../../store';

interface ConsentDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ConsentDialog({ open, onClose }: ConsentDialogProps) {
  const { t } = useTranslation();
  const [detailedChecked, setDetailedChecked] = useState(false);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const markConsentShown = useAppStore((s) => s.markConsentShown);

  const handleConfirm = () => {
    setAnalyticsConsent(true, detailedChecked);
    markConsentShown();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleConfirm}
      closable={false}
      maskClosable={false}
      className="max-w-[420px]"
    >
      {/* Title area with subtle analytics icon */}
      <div className="flex flex-col items-center pt-2 pb-4">
        <div
          className={cn(
            'w-10 h-10 rounded-xl mb-3 flex items-center justify-center',
            'bg-gradient-to-br from-accent/10 to-accent/5',
            'border border-accent/10'
          )}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          >
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-foreground">{t('consent.title')}</h3>
      </div>

      {/* Body */}
      <div className="space-y-4 px-1">
        <p className="text-sm text-foreground-muted leading-relaxed">{t('consent.body')}</p>

        {/* Opt-in checkbox for detailed tier */}
        <label
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg cursor-pointer',
            'border transition-colors duration-150',
            detailedChecked
              ? 'border-accent/30 bg-accent/[0.04]'
              : 'border-border hover:border-foreground/20 hover:bg-surface-accent/50'
          )}
        >
          <input
            type="checkbox"
            checked={detailedChecked}
            onChange={(e) => setDetailedChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
          />
          <span className="text-sm text-foreground leading-relaxed">
            {t('consent.detailedCheckbox')}
          </span>
        </label>

        {/* Settings hint */}
        <p className="text-xs text-foreground-muted/60 leading-relaxed">
          {t('consent.settingsHint')}{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              (window as any).electronAPI.openExternal('https://bobcorn.caldis.me/privacy.html');
            }}
            className="text-accent hover:text-accent/80 transition-colors"
          >
            {t('consent.privacyLink')}
          </a>
        </p>
      </div>

      {/* Confirm button */}
      <div className="flex justify-end pt-5 pb-1">
        <button
          onClick={handleConfirm}
          className={cn(
            'px-5 py-2 rounded-lg text-sm font-medium',
            'bg-accent text-accent-foreground',
            'hover:bg-accent/90 active:bg-accent/80',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-surface'
          )}
        >
          {t('consent.confirm')}
        </button>
      </div>
    </Dialog>
  );
}
