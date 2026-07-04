const DURATION = 2500;
const ANIMATION_DURATION = 250;

type ToastType = 'success' | 'error' | 'warning' | 'info';

function getThemeColor(token: string): string {
  return `hsl(${getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim()})`;
}

const STATUS_TOKENS: Record<ToastType, { text: string; border: string; bg: string }> = {
  success: { text: 'success', border: 'success', bg: 'surface-elevated' },
  error: { text: 'danger', border: 'danger', bg: 'danger-subtle' },
  warning: { text: 'warning', border: 'warning', bg: 'surface-elevated' },
  info: { text: 'foreground', border: 'border', bg: 'surface-elevated' },
};

// Hardcoded, static lucide-style SVG markup (no external/user input) — safe to inject via innerHTML.
const ICON_SVG_ATTRS =
  'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS: Record<ToastType, string> = {
  success: `<svg ${ICON_SVG_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`,
  error: `<svg ${ICON_SVG_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  warning: `<svg ${ICON_SVG_ATTRS}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  info: `<svg ${ICON_SVG_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
};

let toastCount = 0;

function showToast(text: string, type: ToastType, duration = DURATION) {
  const tokens = STATUS_TOKENS[type];
  const iconSvg = ICONS[type];
  const el = document.createElement('div');
  const offset = toastCount * 44;
  toastCount++;

  Object.assign(el.style, {
    position: 'fixed',
    top: `${16 + offset}px`,
    left: '50%',
    transform: 'translateX(-50%) translateY(-6px)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    letterSpacing: '0.01em',
    zIndex: '99999',
    pointerEvents: 'none',
    backgroundColor: getThemeColor(tokens.bg),
    color: getThemeColor(tokens.text),
    border: `1px solid ${getThemeColor(tokens.border)}`,
    boxShadow: '0 4px 16px hsl(var(--foreground) / 0.1)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    opacity: '0',
    transition: `opacity ${ANIMATION_DURATION}ms ease-out, transform ${ANIMATION_DURATION}ms ease-out`,
    whiteSpace: 'nowrap',
  });

  if (iconSvg) {
    const iconEl = document.createElement('span');
    Object.assign(iconEl.style, { display: 'inline-flex', flexShrink: '0' });
    // Safe: iconSvg is one of the hardcoded, static ICONS strings above — never derived from `text`.
    iconEl.innerHTML = iconSvg;
    el.appendChild(iconEl);
  }

  const textEl = document.createElement('span');
  // User-supplied message must stay as text, never innerHTML, to avoid injection.
  textEl.textContent = text;
  el.appendChild(textEl);

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-6px)';
    setTimeout(() => {
      toastCount = Math.max(0, toastCount - 1);
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ANIMATION_DURATION);
  }, duration);
}

export const message = {
  success: (text: string, duration?: number) => showToast(text, 'success', duration),
  error: (text: string, duration?: number) => showToast(text, 'error', duration),
  warning: (text: string, duration?: number) => showToast(text, 'warning', duration),
  info: (text: string, duration?: number) => showToast(text, 'info', duration),
};

export default message;
