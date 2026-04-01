const DURATION = 2500;
const ANIMATION_DURATION = 250;

type ToastType = 'success' | 'error' | 'warning' | 'info';

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

const COLORS: Record<
  ToastType,
  {
    light: { bg: string; text: string; border: string };
    dark: { bg: string; text: string; border: string };
  }
> = {
  success: {
    light: { bg: 'rgba(255, 255, 255, 0.97)', text: '#16a34a', border: 'rgba(187, 247, 208, 1)' },
    dark: { bg: 'rgba(30, 30, 30, 0.97)', text: '#4ade80', border: 'rgba(34, 84, 61, 1)' },
  },
  error: {
    light: { bg: 'rgba(254, 242, 242, 0.97)', text: '#991b1b', border: 'rgba(252, 165, 165, 1)' },
    dark: { bg: 'rgba(40, 20, 20, 0.97)', text: '#fca5a5', border: 'rgba(127, 29, 29, 1)' },
  },
  warning: {
    light: { bg: 'rgba(255, 251, 235, 0.97)', text: '#92400e', border: 'rgba(252, 211, 77, 1)' },
    dark: { bg: 'rgba(40, 35, 18, 0.97)', text: '#fcd34d', border: 'rgba(120, 83, 9, 1)' },
  },
  info: {
    light: { bg: 'rgba(255, 255, 255, 0.97)', text: '#374151', border: 'rgba(229, 231, 235, 1)' },
    dark: { bg: 'rgba(30, 30, 30, 0.97)', text: '#d1d5db', border: 'rgba(55, 65, 81, 1)' },
  },
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✗',
  warning: '!',
  info: '',
};

let toastCount = 0;

function showToast(text: string, type: ToastType, duration = DURATION) {
  const dark = isDark();
  const colors = dark ? COLORS[type].dark : COLORS[type].light;
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
    backgroundColor: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    boxShadow: dark ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
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
