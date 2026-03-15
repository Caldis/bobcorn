// React
import React, { useRef, useEffect } from 'react';
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

function IconBlock({
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
  const iconBlockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selfDOM = iconBlockRef.current;
    if (selfDOM) {
      selfDOM.style.width = selfDOM.clientWidth + 'px';
    }
  }, []);

  const handleSelected = () => {
    handleIconSelected?.(data.id, data);
  };

  return (
    <div
      data-testid="icon-block"
      className={cn(
        // Layout
        'relative inline-block text-center z-[1]',
        // Spacing
        'm-0.5 p-2',
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
      <div
        className={cn(style.iconContentContainer, 'mx-auto w-[120px] transition-all duration-500')}
        style={{ width: width }}
        ref={iconBlockRef}
      >
        <div
          className={cn(
            style.iconContentWrapper,
            'flex items-center justify-center',
            // Ensure SVG fills the container nicely
            '[&>svg]:w-full [&>svg]:h-full'
          )}
          dangerouslySetInnerHTML={{ __html: sanitizeSVG(content) }}
        />
      </div>

      {/* Name and code labels */}
      <div className="w-full transition-all duration-300" style={{ width: width }}>
        <p
          className={cn(
            'w-full block overflow-hidden whitespace-nowrap text-ellipsis',
            'text-xs font-semibold antialiased',
            'mb-1 transition-all duration-300',
            'text-foreground dark:text-foreground'
          )}
          style={{ height: nameVisible ? 18 : 0 }}
        >
          {name}
        </p>
        <p
          className={cn(
            'w-full block overflow-hidden whitespace-nowrap text-ellipsis',
            'text-xs font-mono',
            'mb-1 transition-all duration-300',
            'text-foreground-muted dark:text-foreground-muted'
          )}
          style={{ height: codeVisible ? 18 : 0 }}
        >
          {code}
        </p>
      </div>
    </div>
  );
}

export default IconBlock;
