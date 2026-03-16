// React
import React, { useMemo, useCallback } from 'react';
// Style — minimal residual CSS module for SVG sizing rules only
import style from './index.module.css';
// antd
import { Checkbox } from 'antd';
import { sanitizeSVG } from '../../utils/sanitize';
import { cn } from '../../lib/utils';

interface IconData {
  id: string;
  [key: string]: any;
}

interface IconBlockProps {
  selected?: boolean;
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
  selected = false,
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
  // Memoize sanitized SVG — only re-sanitize when content changes
  const sanitizedHtml = useMemo(() => sanitizeSVG(content), [content]);

  const handleSelected = useCallback(() => {
    handleIconSelected?.(data.id, data);
  }, [data.id]);

  return (
    <div
      data-testid="icon-block"
      className={cn(
        // Layout
        'relative text-center z-[1]',
        // Spacing
        'p-2',
        // Card shape
        'rounded-lg',
        // Border — transparent by default, accent when selected
        'border-2 border-transparent',
        // Cursor
        'cursor-pointer',
        // Smooth transitions
        'transition-all duration-200 ease-in-out',
        // Hover — subtle lift + shadow
        'hover:shadow-md hover:bg-surface-accent hover:-translate-y-0.5',
        'dark:hover:bg-white/5 dark:hover:shadow-lg dark:hover:shadow-black/20',
        // Active — press-down effect
        'active:scale-[0.96] active:border-brand-500',
        // Selected state
        selected && [
          'border-brand-500 bg-surface-accent shadow-sm',
          'dark:border-brand-400 dark:bg-white/5 dark:shadow-brand-900/20',
        ]
      )}
      onClick={handleSelected}
    >
      {/* Checkbox overlay */}
      {checked !== undefined && (
        <Checkbox className="absolute -top-0.5 -right-1.5 z-10" checked={checked} />
      )}

      {/* Icon preview area */}
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

      {/* Name and code labels */}
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
