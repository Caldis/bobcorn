// React
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.set-favorite, icon.get-content
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
  handleIconContextMenu?: (id: string, data: IconData, e: React.MouseEvent) => void;
  // Selection state (lifted from store to props)
  selected?: boolean;
  batchSelected?: boolean;
  showCheckbox?: boolean;
  isFavorite?: boolean;
  /** Column index within the row — used for staggered fade-in delay */
  staggerIndex?: number;
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
  handleIconContextMenu,
  selected = false,
  batchSelected = false,
  showCheckbox = false,
  isFavorite = false,
  staggerIndex = 0,
}: IconBlockProps) {
  const { t } = useTranslation();
  // Store subscriptions — stable selectors to avoid unnecessary re-renders
  const iconId = data.id;
  const patchedContent = useAppStore(
    useCallback((state: any) => state.patchedIcons?.[iconId] ?? null, [iconId])
  );
  const prefetchedContent = useAppStore(
    useCallback((state: any) => state.prefetchedContent?.[iconId] ?? null, [iconId])
  );
  const variantCount = useAppStore(
    useCallback(
      (state: any) => (data.variantOf || !iconId ? 0 : (state.variantCounts?.[iconId] ?? 0)),
      [iconId, data.variantOf]
    )
  );
  // 撞码标识 — 布尔选择器, 仅撞码状态翻转时重渲染
  const isDuplicateCode = useAppStore(
    useCallback((state: any) => !!(code && state.duplicateCodes?.[code.toUpperCase()]), [code])
  );
  // 越界标识 — 所属分组声明了区间且字码落在区间外 (琥珀色, 与撞码红点视觉可区分)
  const isOutOfRange = useAppStore(
    useCallback((state: any) => !!(code && state.outOfRangeCodes?.[code.toUpperCase()]), [code])
  );

  // Lazy-load SVG content from database when icon is mounted (visible in viewport)
  // Prefetched content from batch query takes priority over individual lazy-load
  const [lazyContent, setLazyContent] = useState('');
  useEffect(() => {
    if (!content && iconId && !patchedContent && !prefetchedContent) {
      // Defer to next idle frame to avoid blocking scroll
      const handle = requestIdleCallback(() => {
        const loaded = db.getIconContent(iconId);
        if (loaded) setLazyContent(loaded);
      });
      return () => cancelIdleCallback(handle);
    }
  }, [iconId, content, patchedContent, prefetchedContent]);

  const effectiveContent = patchedContent || prefetchedContent || content || lazyContent;
  const hasContent = !!effectiveContent;
  const sanitizedHtml = useMemo(() => sanitizeSVG(effectiveContent), [effectiveContent]);

  const handleSelected = useCallback(
    (e: React.MouseEvent) => {
      handleIconSelected?.(data.id, data, e);
    },
    [data, handleIconSelected]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      handleIconContextMenu?.(data.id, data, e);
    },
    [data, handleIconContextMenu]
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
      onContextMenu={handleContextMenu}
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

      {/* Variant count badge — top-right corner for parent icons with variants (hidden in batch mode) */}
      {variantCount > 0 && !showCheckbox && (
        <div
          className={cn(
            'absolute top-1 right-1 z-10',
            'min-w-[14px] h-[14px] px-0.5',
            'flex items-center justify-center',
            'rounded-full',
            'bg-foreground/20 text-foreground/70',
            'text-[7px] font-medium leading-[14px]',
            'pointer-events-none'
          )}
        >
          {variantCount}
        </div>
      )}

      <div
        className={cn(style.iconContentContainer, 'mx-auto w-[120px] aspect-square')}
        style={{ width }}
      >
        <div
          className={cn(
            style.iconContentWrapper,
            'flex items-center justify-center',
            'w-full h-full',
            '[&>svg]:w-full [&>svg]:h-full',
            hasContent ? style.iconFadeIn : 'opacity-0'
          )}
          style={hasContent ? { animationDelay: `${staggerIndex * 30}ms` } : undefined}
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
            isDuplicateCode
              ? 'text-warning'
              : isOutOfRange
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-foreground-muted/60'
          )}
          style={{ height: codeVisible ? 18 : 0, overflow: 'hidden' }}
          title={isOutOfRange ? t('editor.codeOutOfGroupRange') : undefined}
        >
          {isDuplicateCode && (
            <span
              className="inline-block align-middle mr-1 h-[5px] w-[5px] rounded-full bg-danger"
              aria-hidden
            />
          )}
          {!isDuplicateCode && isOutOfRange && (
            <span
              className="inline-block align-middle mr-1 h-[5px] w-[5px] rounded-[1px] bg-amber-500 ring-1 ring-surface"
              aria-hidden
            />
          )}
          {code}
        </p>
      </div>
    </div>
  );
});

export default IconBlock;
