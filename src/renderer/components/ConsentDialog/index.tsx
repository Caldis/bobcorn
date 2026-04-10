import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import useAppStore, { analyticsTrack } from '../../store';

/**
 * Self-managing consent card — watches store state internally,
 * renders via portal, never triggers parent re-renders.
 */
export default function ConsentDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [detailedChecked, setDetailedChecked] = useState(false);
  const shownAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const splashScreenVisible = useAppStore((s) => s.splashScreenVisible);
  const scheduledRef = useRef(false);

  const showCard = () => {
    if (open || scheduledRef.current) return; // only once
    scheduledRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    shownAtRef.current = Date.now();
    setOpen(true);
  };

  // When splash disappears (project opened), schedule the consent card
  useEffect(() => {
    if (splashScreenVisible) return;

    const skipCheck = import.meta.env.DEV;
    if (!skipCheck && useAppStore.getState().analyticsConsentShown) return;

    const delay = import.meta.env.DEV
      ? (3 + Math.random() * 7) * 1000 // dev: 3-10s
      : (60 + Math.random() * 540) * 1000; // prod: 1-10min

    timerRef.current = setTimeout(showCard, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [splashScreenVisible]);

  // Immediately show if user exports (font or icon) — high-value moment
  useEffect(() => {
    if (splashScreenVisible) return;
    const skipCheck = import.meta.env.DEV;
    if (!skipCheck && useAppStore.getState().analyticsConsentShown) return;

    const handler = () => showCard();
    window.addEventListener('bobcorn:export-triggered', handler);
    return () => window.removeEventListener('bobcorn:export-triggered', handler);
  }, [splashScreenVisible]);

  // Slide-in animation
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [open]);

  const handleConfirm = () => {
    const delaySeconds = shownAtRef.current
      ? Math.round((Date.now() - shownAtRef.current) / 1000)
      : 0;
    analyticsTrack('consent.respond', {
      detailed_opted_in: detailedChecked,
      response_delay_s: delaySeconds,
    });

    useAppStore.getState().setAnalyticsConsent(true, detailedChecked);
    useAppStore.getState().markConsentShown();

    setVisible(false);
    setTimeout(() => setOpen(false), 200);
  };

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        'fixed z-[100] transition-all duration-300 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ bottom: 60, left: 16, width: 320 }}
    >
      <div
        className={cn(
          'rounded-xl p-4 shadow-lg',
          'bg-surface border border-border',
          'backdrop-blur-sm'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className={cn(
              'w-7 h-7 rounded-lg shrink-0 flex items-center justify-center',
              'bg-gradient-to-br from-accent/10 to-accent/5',
              'border border-accent/10'
            )}
          >
            <svg
              width="14"
              height="14"
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
          <h3 className="text-[13px] font-semibold text-foreground">{t('consent.title')}</h3>
        </div>

        <p className="text-xs text-foreground-muted leading-relaxed mb-3">{t('consent.body')}</p>

        {/* Opt-in checkbox */}
        <label
          className={cn(
            'flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer mb-3',
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
            className="mt-0.5 h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/30"
          />
          <span className="text-xs text-foreground leading-relaxed">
            {t('consent.detailedCheckbox')}
          </span>
        </label>

        {/* Footer */}
        <div className="flex items-end justify-between gap-2">
          <p className="text-[10px] text-foreground-muted/50 leading-relaxed">
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
          <button
            onClick={handleConfirm}
            className={cn(
              'shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium',
              'bg-accent text-accent-foreground',
              'hover:bg-accent/90 active:bg-accent/80',
              'transition-colors duration-150'
            )}
          >
            {t('consent.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
