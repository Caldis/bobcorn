import React, { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { createRoot } from 'react-dom/client';
import { cn } from '../../lib/utils';

// ── 全局鼠标位置追踪 — 记录最后一次点击坐标 ──────────────────────
let lastClickX = 0;
let lastClickY = 0;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'mousedown',
    (e) => {
      lastClickX = e.clientX;
      lastClickY = e.clientY;
    },
    true
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode[] | React.ReactNode | null;
  closable?: boolean;
  maskClosable?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  footer,
  closable = true,
  maskClosable = true,
  children,
  className,
}: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(false);
  const originRef = useRef('center center');

  // 同步计算 transformOrigin — open 从 false→true 时立即捕获点击位置
  if (open && !prevOpenRef.current) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    originRef.current = `calc(50% + ${lastClickX - cx}px) calc(50% + ${lastClickY - cy}px)`;
  }
  prevOpenRef.current = open;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    },
    [onClose]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (maskClosable) {
        onClose();
      } else {
        e.preventDefault();
      }
    },
    [maskClosable, onClose]
  );

  // Handle Escape key
  useEffect(() => {
    if (!open || !closable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closable, onClose]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          onClick={handleOverlayClick}
          className="dialog-overlay fixed inset-0 z-50 bg-surface-overlay"
        />
        <DialogPrimitive.Content
          ref={contentRef}
          onPointerDownOutside={(e) => {
            if (!maskClosable) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!closable) e.preventDefault();
          }}
          style={{ transformOrigin: originRef.current }}
          className={cn(
            'dialog-content',
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-md',
            'rounded-lg border border-border bg-surface shadow-xl',
            'p-6',
            className
          )}
        >
          {title && (
            <DialogPrimitive.Title className="text-lg font-semibold text-foreground mb-4">
              {title}
            </DialogPrimitive.Title>
          )}
          {!title && <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>}
          <div className="text-foreground">{children}</div>
          {footer !== null && footer !== undefined && (
            <div className="mt-4 flex justify-end gap-2">{footer}</div>
          )}
          {closable && (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4',
                'inline-flex h-6 w-6 items-center justify-center rounded-full',
                'text-foreground-muted hover:text-foreground',
                'hover:bg-surface-muted',
                'transition-colors'
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
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── confirm() imperative API ────────────────────────────────────────────

interface ConfirmOptions {
  title?: React.ReactNode;
  content?: React.ReactNode;
  okText?: string;
  okType?: 'default' | 'primary' | 'danger';
  cancelText?: string;
  dangerText?: string;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
  onDanger?: () => void;
}

function ConfirmDialog({
  title,
  content,
  okText,
  okType = 'primary',
  cancelText,
  dangerText,
  onOk,
  onCancel,
  onDanger,
  onClose,
}: ConfirmOptions & { onClose: () => void }) {
  const { t } = useTranslation();
  const resolvedOkText = okText ?? t('common.confirm');
  const resolvedCancelText = cancelText ?? t('common.cancel');
  const [loading, setLoading] = React.useState(false);
  const handleOk = async () => {
    try {
      setLoading(true);
      await onOk?.();
    } finally {
      setLoading(false);
      onClose();
    }
  };
  const handleCancel = () => {
    onCancel?.();
    onClose();
  };
  const handleDanger = () => {
    onDanger?.();
    onClose();
  };

  const okBtnClass = cn(
    'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
    okType === 'danger' && 'bg-danger text-accent-foreground hover:bg-danger/90',
    okType === 'primary' && 'bg-accent text-accent-foreground hover:bg-accent/90',
    okType === 'default' && 'border border-border text-foreground hover:bg-surface-muted'
  );

  const buttons = [
    <button
      key="cancel"
      onClick={handleCancel}
      disabled={loading}
      className="px-4 py-1.5 rounded-md text-sm font-medium border border-border text-foreground hover:bg-surface-muted transition-colors"
    >
      {resolvedCancelText}
    </button>,
  ];
  if (dangerText) {
    buttons.push(
      <button
        key="danger"
        onClick={handleDanger}
        disabled={loading}
        className="px-4 py-1.5 rounded-md text-sm font-medium bg-danger text-accent-foreground hover:bg-danger/90 transition-colors"
      >
        {dangerText}
      </button>
    );
  }
  buttons.push(
    <button key="ok" onClick={handleOk} disabled={loading} className={okBtnClass}>
      {resolvedOkText}
    </button>
  );

  return (
    <Dialog open={true} onClose={handleCancel} title={title} footer={buttons}>
      <div className="text-sm text-foreground-muted">{content}</div>
    </Dialog>
  );
}

export function confirm(options: ConfirmOptions) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const destroy = () => {
    root.unmount();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };

  root.render(<ConfirmDialog {...options} onClose={destroy} />);

  return destroy;
}

export default Dialog;
