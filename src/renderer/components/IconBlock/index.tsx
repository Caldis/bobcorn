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
  data?: IconData;
  name?: string;
  code?: string;
  content?: string;
  width?: number | string;
  nameVisible?: boolean;
  codeVisible?: boolean;
  handleIconSelected?: (id: string, data: IconData, e?: React.MouseEvent) => void;
}

const IconBlock = React.memo(function IconBlock({
  data = {} as IconData,
  name = '',
  code,
  content = '',
  width = 'auto',
  nameVisible = true,
  codeVisible = true,
  handleIconSelected,
}: IconBlockProps) {
  const selected = useAppStore((state: any) => state.selectedIcon === data.id);
  const batchSelected = useAppStore((state: any) => state.selectedIcons.has(data.id));
  const showCheckbox = useAppStore((state: any) => state.batchMode || state.selectedIcons.size > 0);
  // 热更新：优先使用 store 中 patch 的内容
  const patchedContent = useAppStore((state: any) => state.patchedIcons?.[data.id]);
  const effectiveContent = patchedContent || content;

  const sanitizedHtml = useMemo(() => sanitizeSVG(effectiveContent), [effectiveContent]);

  const handleSelected = useCallback(
    (e: React.MouseEvent) => {
      handleIconSelected?.(data.id, data, e);
    },
    [data.id]
  );

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
        ],
        batchSelected &&
          !selected && [
            'bg-brand-50 border-brand-300',
            'dark:bg-brand-950/30 dark:border-brand-500/50',
          ]
      )}
      onClick={handleSelected}
    >
      {showCheckbox && (
        <Checkbox className="absolute -top-0.5 -right-1.5 z-10" checked={batchSelected} />
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
