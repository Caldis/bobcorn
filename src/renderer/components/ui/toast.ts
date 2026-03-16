const DURATION = 2500;
const ANIMATION_DURATION = 300;

type ToastType = 'success' | 'error' | 'warning';

const COLORS: Record<ToastType, { bg: string; text: string; border: string }> = {
  success: {
    bg: 'rgba(255, 255, 255, 0.97)',
    text: '#374151',
    border: 'rgba(229, 231, 235, 1)',
  },
  error: {
    bg: 'rgba(254, 242, 242, 0.97)',
    text: '#991b1b',
    border: 'rgba(252, 165, 165, 1)',
  },
  warning: {
    bg: 'rgba(255, 251, 235, 0.97)',
    text: '#92400e',
    border: 'rgba(252, 211, 77, 1)',
  },
};

let toastCount = 0;

function showToast(text: string, type: ToastType) {
  const colors = COLORS[type];
  const el = document.createElement('div');
  const offset = toastCount * 48;
  toastCount++;

  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    top: `${20 + offset}px`,
    left: '50%',
    transform: 'translateX(-50%) translateY(-8px)',
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    zIndex: '99999',
    pointerEvents: 'none',
    backgroundColor: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    opacity: '0',
    transition: `opacity ${ANIMATION_DURATION}ms ease, transform ${ANIMATION_DURATION}ms ease`,
    whiteSpace: 'nowrap',
  });

  document.body.appendChild(el);

  // Trigger enter animation
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Fade out and remove
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(() => {
      toastCount = Math.max(0, toastCount - 1);
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, ANIMATION_DURATION);
  }, DURATION);
}

export const message = {
  success: (text: string) => showToast(text, 'success'),
  error: (text: string) => showToast(text, 'error'),
  warning: (text: string) => showToast(text, 'warning'),
};

export default message;
