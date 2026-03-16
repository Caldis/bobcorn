// React
import React, { useMemo, useCallback } from 'react';
// Style — minimal residual CSS module for SVG sizing rules only
import style from './index.module.css';
// UI
import { Checkbox } from '../ui';
import { sanitizeSVG } from '../../utils/sanitize';
import { cn } from '../../lib/utils';
// Store
import useAppStore from '../../store';

interface IconData {
  id: string;
  [key: string]: any;
}

interface IconBlockProps {
  checked?: boolean;
  data?: IconData;
  name?: string;
  code?: string;
  content?: string;
  width?: number | string;
  nameVisible?: boolean;
  codeVisible?: boolean;
  handleIconSelected?: (id: string, data: IconData) => void;
}

const IconBlock = React.memo(function IconBlock({
  checked,
  data = {} as IconData,
  name = '',
  code,
  content = '',
  width = 'auto',
  nameVisible = true,
  codeVisible = true,
  handleIconSelected,
}: IconBlockProps) {
  // 直接从 store 读 selectedIcon — 选中变化只触发相关 2 个 IconBlock 重渲染
  const selected = useAppStore((state: any) => state.selectedIcon === data.id);

  const sanitizedHtml = useMemo(() => sanitizeSVG(content), [content]);

  const handleSelected = useCallback(() => {
    handleIconSelected?.(data.id, data);
  }, [data.id]);

  return (
    <div
      data-testid="icon-block"
      className={cn(
        'relative text-center z-[1]',
        'p-2',
        'rounded-lg',
        'border-2 border-transparent',
        'cursor-pointer',
        'transition-all duration-200 ease-in-out',
        'hover:shadow-md hover:bg-surface-accent hover:-translate-y-0.5',
        'dark:hover:bg-white/5 dark:hover:shadow-lg dark:hover:shadow-black/20',
        'active:scale-[0.96] active:border-brand-500',
        selected && [
          'border-brand-500 bg-surface-accent shadow-sm',
          'dark:border-brand-400 dark:bg-white/5 dark:shadow-brand-900/20',
        ]
      )}
      onClick={handleSelected}
    >
      {checked !== undefined && (
        <Checkbox className="absolute -top-0.5 -right-1.5 z-10" checked={checked} />
      )}

      <div className={cn(style.iconContentContainer, 'mx-auto w-[120px]')} style={{ width }}>
        <div
          className={cn(
            style.iconContentWrapper,
            'flex items-center justify-center',
            '[&>svg]:w-full [&>svg]:h-full'
          )}
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </div>

      <div className="w-full" style={{ width }}>
        <p
          className={cn(
            'w-full block overflow-hidden whitespace-nowrap text-ellipsis',
            'text-xs font-semibold antialiased',
            'mb-1',
            'text-foreground dark:text-foreground'
          )}
          style={{ height: nameVisible ? 18 : 0, overflow: 'hidden' }}
        >
          {name}
        </p>
        <p
          className={cn(
            'w-full block overflow-hidden whitespace-nowrap text-ellipsis',
            'text-[10px] font-semibold tracking-widest',
            'mb-1',
            'text-foreground-muted/60 dark:text-foreground-muted/60'
          )}
          style={{ height: codeVisible ? 18 : 0, overflow: 'hidden' }}
        >
          {code}
        </p>
      </div>
    </div>
  );
});

export default IconBlock;
