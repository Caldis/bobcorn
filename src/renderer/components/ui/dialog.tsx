import React, { useEffect, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { createRoot } from 'react-dom/client';
import { cn } from '../../lib/utils';

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
          className={cn(
            'fixed inset-0 z-50',
            'bg-black/40 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
          )}
        />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => {
            if (!maskClosable) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!closable) e.preventDefault();
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-md',
            'rounded-lg border border-border bg-surface shadow-xl',
            'p-6',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
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
  onOk?: () => void;
  onCancel?: () => void;
}

function ConfirmDialog({
  title,
  content,
  okText = '确定',
  okType = 'primary',
  cancelText = '取消',
  onOk,
  onCancel,
  onClose,
}: ConfirmOptions & { onClose: () => void }) {
  const handleOk = () => {
    onOk?.();
    onClose();
  };
  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  const okBtnClass = cn(
    'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
    okType === 'danger' && 'bg-red-500 text-white hover:bg-red-600',
    okType === 'primary' && 'bg-brand-500 text-white hover:bg-brand-600',
    okType === 'default' && 'border border-border text-foreground hover:bg-surface-muted'
  );

  return (
    <Dialog
      open={true}
      onClose={handleCancel}
      title={title}
      footer={[
        <button
          key="cancel"
          onClick={handleCancel}
          className="px-4 py-1.5 rounded-md text-sm font-medium border border-border text-foreground hover:bg-surface-muted transition-colors"
        >
          {cancelText}
        </button>,
        <button key="ok" onClick={handleOk} className={okBtnClass}>
          {okText}
        </button>,
      ]}
    >
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
