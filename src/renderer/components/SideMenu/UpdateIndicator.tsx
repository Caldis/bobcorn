import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store';
import { confirm } from '../ui/dialog';
import { cn } from '../../lib/utils';

const { electronAPI } = window;

const CHANGELOG_URL = 'https://bobcorn.caldis.me/changelog.json';

// Hover-card layout constants (px).
const CARD_WIDTH = 240;
const VIEWPORT_MARGIN = 8; // keep this far from the window edges
const ANCHOR_GAP = 8; // gap between the trigger button and the card

interface ChangelogEntry {
  version: string;
  date: string;
  summary?: { zh: string; en: string };
  changes?: { zh: string[]; en: string[] };
}

/**
 * Convert the release notes delivered by electron-updater (an HTML string for
 * the GitHub provider — the rendered release body) into safe plain text.
 *
 * Security: we never inject the string as HTML. DOMParser('text/html') builds
 * an inert document (no scripts run, no resources load); we only read
 * textContent. Block/list elements are turned into newlines so the fallback
 * stays readable. If the input is plain text/markdown it passes through mostly
 * unchanged.
 */
function releaseNotesToText(input: string | null | undefined): string {
  if (!input) return '';
  try {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('li').forEach((li) => {
      li.prepend('• ');
      li.append('\n');
    });
    doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, tr').forEach((el) => el.append('\n'));
    return (doc.body.textContent || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return String(input).trim();
  }
}

function UpdateIndicator({ onInstall }: { onInstall: () => void }) {
  const { t, i18n } = useTranslation();
  const status = useAppStore((s) => s.updateStatus);
  const version = useAppStore((s) => s.updateVersion);
  const progress = useAppStore((s) => s.updateProgress);
  const error = useAppStore((s) => s.updateError);
  const releaseNotes = useAppStore((s) => s.updateReleaseNotes);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [changelogEntry, setChangelogEntry] = useState<ChangelogEntry | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; bottom: number } | null>(null);

  // Fallback release notes (from electron-updater / GitHub Release body),
  // rendered as safe plain text when the website changelog is unavailable.
  const notesText = useMemo(() => releaseNotesToText(releaseNotes), [releaseNotes]);

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

  // Position the hover card relative to the trigger button, clamped inside the
  // window so it never gets cut off by the left/right edges (the indicator sits
  // in the bottom-left status bar). Recomputed on window resize.
  useLayoutEffect(() => {
    const active = hoverCard && (status === 'downloaded' || status === 'available');
    if (!active) {
      setCardPos(null);
      return;
    }
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN);
      // Align the card's left edge with the trigger, then clamp into the viewport.
      const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), maxLeft);
      // Anchor above the trigger via `bottom` so we don't need the card height.
      const bottom = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.top + ANCHOR_GAP);
      setCardPos({ left, bottom });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [hoverCard, status]);

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
        ref={triggerRef}
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

      {/* Hover card — version + release notes preview.
          Rendered in a portal with fixed, viewport-clamped positioning so it is
          never cut off by the window edges. */}
      {hoverCard &&
        showHoverCard &&
        cardPos &&
        createPortal(
          <div
            role="dialog"
            style={{
              position: 'fixed',
              left: cardPos.left,
              bottom: cardPos.bottom,
              width: CARD_WIDTH,
            }}
            className={cn(
              'z-[9999] rounded-lg',
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

            {/* Release notes — prefer the structured website changelog, then fall
                back to the notes electron-updater delivered inline, then a
                placeholder. */}
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
                  <ul className="text-[11px] text-foreground-muted/70 leading-relaxed list-disc pl-3.5 space-y-0.5 max-h-[240px] overflow-y-auto">
                    {(i18n.language.startsWith('zh')
                      ? changelogEntry.changes.zh
                      : changelogEntry.changes.en
                    ).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : notesText ? (
              <div className="px-3 pb-3">
                <p className="text-[11px] text-foreground-muted/80 leading-relaxed whitespace-pre-line max-h-[240px] overflow-y-auto">
                  {notesText}
                </p>
              </div>
            ) : (
              <div className="px-3 pb-3">
                <p className="text-[11px] text-foreground-muted/40 italic">
                  {t('update.noChangelog')}
                </p>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

export default React.memo(UpdateIndicator);
