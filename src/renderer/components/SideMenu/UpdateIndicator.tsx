import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Maximize2 } from 'lucide-react';
import useAppStore from '../../store';
import Dialog, { confirm } from '../ui/dialog';
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
 * Compare two semver-ish version strings ("1.14.0", "1.15.0-beta.1").
 * Returns >0 if a is newer, <0 if b is newer, 0 if equal. A release outranks
 * any prerelease of the same core version.
 */
function compareVersions(a: string, b: string): number {
  const [coreA, preA] = a.replace(/^v/, '').split('-');
  const [coreB, preB] = b.replace(/^v/, '').split('-');
  const na = coreA.split('.').map((n) => parseInt(n, 10) || 0);
  const nb = coreB.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (na[i] || 0) - (nb[i] || 0);
    if (d !== 0) return d;
  }
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (preA && preB) return preA.localeCompare(preB, undefined, { numeric: true });
  return 0;
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

/**
 * Changelog content shared by the hover card (compact) and the zoom dialog
 * (roomier). Renders the aggregated website entries when available, otherwise
 * the plain-text release notes from electron-updater, otherwise a placeholder.
 */
function ChangelogBody({
  entries,
  notesText,
  variant,
}: {
  entries: ChangelogEntry[];
  notesText: string;
  variant: 'card' | 'dialog';
}) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const compact = variant === 'card';
  const textCls = compact ? 'text-[11px]' : 'text-[13px]';

  if (entries.length > 0) {
    return (
      <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
        {entries.map((entry) => (
          <div key={entry.version}>
            {/* Per-version header — only meaningful when aggregating several
                versions (cross-version update); a single entry keeps the card
                header as its only title. */}
            {(entries.length > 1 || !compact) && (
              <div className={cn('flex items-baseline gap-1.5', compact ? 'mb-1' : 'mb-1.5')}>
                <span className={cn(textCls, 'font-medium text-foreground')}>v{entry.version}</span>
                {entry.date && (
                  <span
                    className={cn(
                      compact ? 'text-[10px]' : 'text-[11px]',
                      'text-foreground-muted/50'
                    )}
                  >
                    {entry.date}
                  </span>
                )}
              </div>
            )}
            {entry.summary && (
              <p className={cn(textCls, 'text-foreground-muted leading-relaxed mb-1.5')}>
                {zh ? entry.summary.zh : entry.summary.en}
              </p>
            )}
            {entry.changes && (
              <ul
                className={cn(
                  textCls,
                  'text-foreground-muted/70 leading-relaxed list-disc pl-3.5 space-y-0.5'
                )}
              >
                {(zh ? entry.changes.zh : entry.changes.en).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (notesText) {
    return (
      <p className={cn(textCls, 'text-foreground-muted/80 leading-relaxed whitespace-pre-line')}>
        {notesText}
      </p>
    );
  }

  return (
    <p className={cn(textCls, 'text-foreground-muted/40 italic')}>{t('update.noChangelog')}</p>
  );
}

function UpdateIndicator({ onInstall }: { onInstall: () => void }) {
  const { t } = useTranslation();
  const status = useAppStore((s) => s.updateStatus);
  const version = useAppStore((s) => s.updateVersion);
  const progress = useAppStore((s) => s.updateProgress);
  const error = useAppStore((s) => s.updateError);
  const releaseNotes = useAppStore((s) => s.updateReleaseNotes);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [changelogEntries, setChangelogEntries] = useState<ChangelogEntry[]>([]);
  const [cardPos, setCardPos] = useState<{
    left: number;
    bottom: number;
    maxHeight: number;
  } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

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

  // Fetch the website changelog and aggregate every version the user is about
  // to skip over: (installed version, target version]. A cross-version update
  // (e.g. 1.12.3 → 1.14.0) then lists 1.13.x and 1.14.0 instead of showing
  // only the newest entry. Falls back to the exact target entry when the
  // installed version cannot be matched against the feed.
  useEffect(() => {
    if (!version || (status !== 'available' && status !== 'downloaded')) {
      setChangelogEntries([]);
      return;
    }
    fetch(CHANGELOG_URL, { cache: 'no-cache' })
      .then((r) => r.json())
      .then((entries: ChangelogEntry[]) => {
        const pending = entries
          .filter(
            (e) =>
              compareVersions(e.version, __APP_VERSION__) > 0 &&
              compareVersions(e.version, version) <= 0
          )
          .sort((a, b) => compareVersions(b.version, a.version));
        if (pending.length > 0) {
          setChangelogEntries(pending);
          return;
        }
        const exact = entries.find((e) => e.version === version);
        setChangelogEntries(exact ? [exact] : []);
      })
      .catch(() => {});
  }, [version, status]);

  // Position the hover card relative to the trigger button, clamped inside the
  // window so it never gets cut off by the left/right edges (the indicator sits
  // in the bottom-left status bar). The card is capped to a third of the window
  // height — long changelogs scroll inside it instead of flying off-screen.
  // Recomputed on window resize.
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
      const maxHeight = Math.floor(window.innerHeight / 3);
      setCardPos({ left, bottom, maxHeight });
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

  const openZoom = () => {
    clearTimeout(hoverTimeout.current);
    setHoverCard(false);
    setZoomOpen(true);
  };

  // Cross-version updates show the skipped range in the dialog title.
  const versionRange =
    changelogEntries.length > 1 ? `v${__APP_VERSION__} → v${version}` : `v${version}`;

  return (
    <>
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
          {status === 'error' && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
          )}

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
          never cut off by the window edges. Capped to 1/3 of the window height;
          the body scrolls and clicking anywhere opens the full-size dialog. */}
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
                maxHeight: cardPos.maxHeight,
              }}
              title={t('update.clickToExpand')}
              className={cn(
                'z-[9999] rounded-lg',
                'border border-border bg-surface shadow-lg',
                'flex flex-col overflow-hidden',
                'cursor-pointer',
                'animate-in fade-in slide-in-from-bottom-1 duration-150'
              )}
              onClick={openZoom}
              onMouseEnter={() => {
                clearTimeout(hoverTimeout.current);
              }}
              onMouseLeave={handleMouseLeave}
            >
              {/* Header */}
              <div className="shrink-0 px-3 pt-3 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                  <span className="text-xs font-medium text-foreground">
                    {changelogEntries.length > 1 ? versionRange : `v${version}`}
                  </span>
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
                  <Maximize2 size={11} className="shrink-0 text-foreground-muted/60" />
                </div>
              </div>

              {/* Body — scrolls inside the height-capped card. */}
              <div className="min-h-0 overflow-y-auto px-3 pb-3">
                <ChangelogBody entries={changelogEntries} notesText={notesText} variant="card" />
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* Zoomed changelog dialog — full content, scrollable. Rendered outside
          the hover wrapper: its portal would otherwise bubble React mouse
          events back into the wrapper and re-open the hover card behind it. */}
      <Dialog
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        title={
          <span className="flex items-baseline gap-2">
            <span>{t('update.changelog')}</span>
            <span className="text-sm font-normal text-foreground-muted">{versionRange}</span>
          </span>
        }
        footer={null}
        className="max-w-xl"
      >
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <ChangelogBody entries={changelogEntries} notesText={notesText} variant="dialog" />
        </div>
      </Dialog>
    </>
  );
}

export default React.memo(UpdateIndicator);
