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

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✗',
  warning: '!',
  info: '',
};

let toastCount = 0;

function showToast(text: string, type: ToastType, duration = DURATION) {
  const tokens = STATUS_TOKENS[type];
  const icon = ICONS[type];
  const el = document.createElement('div');
  const offset = toastCount * 44;
  toastCount++;

  el.textContent = icon ? `${icon}  ${text}` : text;
  Object.assign(el.style, {
    position: 'fixed',
    top: `${16 + offset}px`,
    left: '50%',
    transform: 'translateX(-50%) translateY(-6px)',
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
