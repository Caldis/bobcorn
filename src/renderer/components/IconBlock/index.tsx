// React
import React, { useMemo, useCallback, useState, useEffect } from 'react';
// Style — minimal residual CSS module for SVG sizing rules only
import style from './index.module.css';
// UI
import { Checkbox } from '../ui';
import { Star } from 'lucide-react';
import { sanitizeSVG } from '../../utils/sanitize';
import { cn } from '../../lib/utils';
// Store
import useAppStore from '../../store';
// Database — lazy content loading
import db from '../../database';

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
  // Selection state (lifted from store to props)
  selected?: boolean;
  batchSelected?: boolean;
  showCheckbox?: boolean;
  isFavorite?: boolean;
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
  selected = false,
  batchSelected = false,
  showCheckbox = false,
  isFavorite = false,
}: IconBlockProps) {
  // Only 1 store subscription — hot-patch content for color editing
  const patchedContent = useAppStore((state: any) => state.patchedIcons?.[data.id]);

  // Lazy-load SVG content from database when icon is mounted (visible in viewport)
  const [lazyContent, setLazyContent] = useState(content || '');
  useEffect(() => {
    if (!content && data.id && !patchedContent) {
      const loaded = db.getIconContent(data.id);
      if (loaded) setLazyContent(loaded);
    }
  }, [data.id, content, patchedContent]);

  const effectiveContent = patchedContent || content || lazyContent;

  // Variant count badge for parent icons (non-variant icons that have variants)
  const variantCount = useMemo(() => {
    if (data.variantOf) return 0; // variant icons never show a badge
    if (!data.id) return 0;
    return db.getVariantCount(data.id);
  }, [data.id, data.variantOf]);

  const sanitizedHtml = useMemo(() => sanitizeSVG(effectiveContent), [effectiveContent]);

  const handleSelected = useCallback(
    (e: React.MouseEvent) => {
      handleIconSelected?.(data.id, data, e);
    },
    [data, handleIconSelected]
  );

  const handleFavoriteToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      db.setIconFavorite(data.id, isFavorite ? 0 : 1);
      useAppStore.getState().syncLeft();
    },
    [data.id, isFavorite]
  );

  return (
    <div
      data-testid="icon-block"
      className={cn(
        'group/icon',
        'relative text-center z-[1]',
        'p-2',
        'rounded-lg',
        'border-2 border-transparent',
        'cursor-pointer',
        'transition-all duration-200 ease-in-out',
        'hover:shadow-md hover:bg-surface-accent hover:-translate-y-0.5',
        'active:scale-[0.96] active:border-accent',
        selected && ['border-accent bg-surface-accent shadow-sm shadow-black/20'],
        batchSelected && !selected && ['bg-accent-subtle border-accent/40']
      )}
      onClick={handleSelected}
    >
      {showCheckbox && (
        <div
          className="absolute -top-0.5 -right-1.5 z-10"
          onClick={(e) => {
            e.stopPropagation();
            useAppStore.getState().toggleIconSelection(data.id);
          }}
        >
          <Checkbox className="pointer-events-none" checked={batchSelected} />
        </div>
      )}

      {/* Favorite star — left-top corner, hidden in batch mode */}
      {!showCheckbox && (
        <div
          className={cn(
            'absolute top-1 left-1 z-10',
            'w-5 h-5 flex items-center justify-center',
            'rounded-full cursor-pointer',
            'transition-opacity duration-150',
            isFavorite ? 'opacity-100' : 'opacity-0 group-hover/icon:opacity-50 hover:!opacity-80'
          )}
          onClick={handleFavoriteToggle}
        >
          <Star
            size={14}
            className={cn(
              isFavorite ? 'fill-amber-400 stroke-amber-400' : 'fill-none stroke-foreground-muted'
            )}
          />
        </div>
      )}

      {/* Variant count badge — bottom-right corner for parent icons with variants */}
      {variantCount > 0 && (
        <div
          className={cn(
            'absolute bottom-1 right-1 z-10',
            'min-w-[16px] h-4 px-1',
            'flex items-center justify-center',
            'rounded-full',
            'bg-accent text-accent-foreground',
            'text-[9px] font-semibold leading-none',
            'pointer-events-none'
          )}
        >
          {variantCount}
        </div>
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

      <div className="mx-auto w-full" style={{ width }}>
        <p
          className={cn(
            'w-full block overflow-hidden whitespace-nowrap text-ellipsis',
            'text-xs font-semibold antialiased',
            'mb-1',
            'text-foreground'
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
            'text-foreground-muted/60'
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
