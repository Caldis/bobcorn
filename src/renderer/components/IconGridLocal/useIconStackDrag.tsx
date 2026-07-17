// 图标拖拽聚合 (iOS 桌面多选式) — 从画布拖拽选中图标到左侧边栏分组
//
// 自定义鼠标拖拽 (非 HTML5 DnD, 与 react-dropzone 的文件拖入互不干扰):
// mousedown 于图标块 + 移动超过阈值后启动。启动时克隆可见的选中图标,
// 以顺滑动画从原位飞向光标聚合成一叠错位卡片, 右上角角标显示总数;
// 拖动中 elementFromPoint 命中带 [data-icon-drop-target] 的侧边栏行时
// 以 data-drop-hover 标记高亮 (样式见 globals.css); 松手落入目标则回调
// onDrop, 否则卡片飞回原位。位置更新全部走 ref 直改 DOM, 不触发 React 重渲染。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useAppStore from '../../store';
import { sanitizeSVG } from '../../utils/sanitize';

const DRAG_THRESHOLD = 5; // px, 与 marquee 的启动阈值一致量级, 区分点击与拖拽
const MAX_CLONES = 5; // 叠放卡片上限, 其余数量由角标表达
const CARD_SIZE = 52; // px, 聚合后单张卡片的目标边长
// 错位参数 — 第 0 张 (按下的图标) 在最上层居中, 其后依次轻微旋转/偏移
const STACK_ROT = [0, -6, 6, -11, 11];
const STACK_DX = [0, -6, 6, -10, 10];
const STACK_DY = [0, 4, 6, 9, 11];

interface CloneData {
  id: string;
  html: string;
  rect: { left: number; top: number; width: number; height: number };
}

interface UseIconStackDragOptions {
  /** 画布滚动容器 — 用于按 data-icon-id 查询可见图标块 */
  containerRef: React.RefObject<HTMLElement | null>;
  /** 松手落入侧边栏目标时回调 (targetGroupId 来自 data-icon-drop-target) */
  onDrop: (ids: string[], targetGroupId: string) => void;
  /** 拖拽结束后回调 — 用于吞掉紧随其后的 click, 避免误选/误取消选择 */
  onDragFinish: () => void;
}

export function useIconStackDrag({ containerRef, onDrop, onDragFinish }: UseIconStackDragOptions) {
  const [clones, setClones] = useState<CloneData[] | null>(null);
  const [dragCount, setDragCount] = useState(0);

  const pressRef = useRef<{ x: number; y: number; iconId: string } | null>(null);
  const dragRef = useRef<{
    ids: string[];
    active: boolean;
    finished: boolean;
    cursor: { x: number; y: number };
    hoverEl: HTMLElement | null;
  } | null>(null);
  const cloneDataRef = useRef<CloneData[]>([]);
  const cloneElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const badgeElRef = useRef<HTMLDivElement | null>(null);
  const handlersRef = useRef<{
    move?: (e: MouseEvent) => void;
    up?: (e: MouseEvent) => void;
    key?: (e: KeyboardEvent) => void;
  }>({});

  const applyTransforms = useCallback(() => {
    const d = dragRef.current;
    if (!d?.active) return;
    cloneDataRef.current.forEach((c, i) => {
      const el = cloneElsRef.current[i];
      if (!el) return;
      const scale = CARD_SIZE / Math.max(c.rect.width, 1);
      const tx = d.cursor.x - (c.rect.left + c.rect.width / 2) + STACK_DX[i];
      const ty = d.cursor.y - (c.rect.top + c.rect.height / 2) + STACK_DY[i];
      el.style.transform = `translate(${tx}px, ${ty}px) rotate(${STACK_ROT[i]}deg) scale(${scale})`;
    });
    const badge = badgeElRef.current;
    if (badge) {
      badge.style.transform = `translate(${d.cursor.x + CARD_SIZE / 2 - 10}px, ${d.cursor.y - CARD_SIZE / 2 - 10}px)`;
      badge.style.opacity = '1';
    }
  }, []);

  const setHover = useCallback((next: HTMLElement | null) => {
    const d = dragRef.current;
    if (!d || d.hoverEl === next) return;
    d.hoverEl?.removeAttribute('data-drop-hover');
    next?.setAttribute('data-drop-hover', '');
    d.hoverEl = next;
  }, []);

  const detachListeners = useCallback(() => {
    const h = handlersRef.current;
    if (h.move) document.removeEventListener('mousemove', h.move);
    if (h.up) document.removeEventListener('mouseup', h.up);
    if (h.key) document.removeEventListener('keydown', h.key, true);
  }, []);

  // 结束拖拽 — dropped: 落入目标 (卡片原地缩小消散), 否则飞回原位
  const endDrag = useCallback(
    (dropped: boolean) => {
      const d = dragRef.current;
      if (!d?.active || d.finished) return;
      d.finished = true;
      detachListeners();
      setHover(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      cloneDataRef.current.forEach((c, i) => {
        const el = cloneElsRef.current[i];
        if (!el) return;
        if (dropped) {
          el.style.transition = 'transform 160ms ease-in, opacity 160ms ease-in';
          const scale = (CARD_SIZE / Math.max(c.rect.width, 1)) * 0.4;
          const tx = d.cursor.x - (c.rect.left + c.rect.width / 2) + STACK_DX[i];
          const ty = d.cursor.y - (c.rect.top + c.rect.height / 2) + STACK_DY[i];
          el.style.transform = `translate(${tx}px, ${ty}px) rotate(${STACK_ROT[i]}deg) scale(${scale})`;
          el.style.opacity = '0';
        } else {
          el.style.transform = 'translate(0, 0) rotate(0deg) scale(1)';
        }
      });
      const badge = badgeElRef.current;
      if (badge) badge.style.opacity = '0';

      window.setTimeout(
        () => {
          dragRef.current = null;
          cloneDataRef.current = [];
          cloneElsRef.current = [];
          setClones(null);
          setDragCount(0);
        },
        dropped ? 180 : 300
      );
      onDragFinish();
    },
    [detachListeners, setHover, onDragFinish]
  );

  const startDrag = useCallback(() => {
    const press = pressRef.current;
    const container = containerRef.current;
    if (!press || !container) return;

    const s = useAppStore.getState();
    // 按在多选集内 → 拖整个选中集; 否则只拖按下的这一个
    const ids: string[] =
      s.selectedIcons.has(press.iconId) && s.selectedIcons.size > 1
        ? [
            press.iconId,
            ...(Array.from(s.selectedIcons) as string[]).filter((id) => id !== press.iconId),
          ]
        : [press.iconId];

    // 克隆可见图标的预览 svg (虚拟滚动下不可见的没有 DOM 节点, 由角标表达数量)
    // 只取 svg 的 outerHTML — 不带 IconBlock 的 wrapper 类, 避免淡入动画在克隆上重放
    const cloneData: CloneData[] = [];
    for (const id of ids) {
      if (cloneData.length >= MAX_CLONES) break;
      const preview = container.querySelector(
        `[data-icon-id="${CSS.escape(id)}"] [data-icon-preview]`
      );
      const svg = preview?.querySelector('svg');
      if (!preview || !svg) continue;
      const rect = preview.getBoundingClientRect();
      if (rect.width === 0) continue;
      cloneData.push({
        id,
        html: sanitizeSVG(svg.outerHTML),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    }
    if (cloneData.length === 0) return;

    dragRef.current = {
      ids,
      active: true,
      finished: false,
      cursor: { x: press.x, y: press.y },
      hoverEl: null,
    };
    cloneDataRef.current = cloneData;
    cloneElsRef.current = [];
    setClones(cloneData);
    setDragCount(ids.length);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }, [containerRef]);

  const onMove = useCallback(
    (e: MouseEvent) => {
      const press = pressRef.current;
      if (!press) return;
      const d = dragRef.current;
      if (!d) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
        startDrag();
        // 启动失败 (如目标块已被虚拟滚动卸载) → 放弃本次按压, 不再反复尝试
        if (!dragRef.current) {
          pressRef.current = null;
          detachListeners();
          return;
        }
      }
      const drag = dragRef.current;
      if (!drag?.active || drag.finished) return;
      drag.cursor = { x: e.clientX, y: e.clientY };
      applyTransforms();
      // 克隆卡片 pointer-events:none, elementFromPoint 直接命中其下方元素
      const under = document.elementFromPoint(e.clientX, e.clientY);
      setHover((under?.closest('[data-icon-drop-target]') as HTMLElement | null) ?? null);
    },
    [startDrag, applyTransforms, setHover, detachListeners]
  );

  const onUp = useCallback(() => {
    const drag = dragRef.current;
    pressRef.current = null;
    if (!drag?.active) {
      // 未达阈值的普通点击 — 交还给 IconBlock 自己的 click 处理
      detachListeners();
      return;
    }
    const target = drag.hoverEl;
    const targetGroupId = target?.getAttribute('data-icon-drop-target');
    if (targetGroupId) {
      endDrag(true);
      onDrop(drag.ids, targetGroupId);
    } else {
      endDrag(false);
    }
  }, [detachListeners, endDrag, onDrop]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!dragRef.current?.active) return;
      e.preventDefault();
      e.stopPropagation();
      pressRef.current = null;
      endDrag(false);
    },
    [endDrag]
  );

  /** 图标块 mousedown 入口 — 由 IconGridLocal 的容器级 mousedown 调用 */
  const pressIcon = useCallback(
    (e: React.MouseEvent, iconId: string) => {
      if (e.button !== 0) return;
      pressRef.current = { x: e.clientX, y: e.clientY, iconId };
      handlersRef.current = { move: onMove, up: onUp, key: onKey };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('keydown', onKey, true);
    },
    [onMove, onUp, onKey]
  );

  // 卸载兜底 — 组件销毁时移除残留监听与全局样式
  useEffect(() => {
    return () => {
      detachListeners();
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      dragRef.current?.hoverEl?.removeAttribute('data-drop-hover');
    };
  }, [detachListeners]);

  const dragLayer = clones
    ? createPortal(
        <div className="fixed inset-0 z-[10000] pointer-events-none">
          {clones.map((c, i) => (
            <div
              key={c.id}
              ref={(el) => {
                cloneElsRef.current[i] = el;
                // 首帧挂载后再应用目标 transform, 让卡片从原位平滑飞向光标
                if (el && !el.dataset.flown) {
                  el.dataset.flown = '1';
                  requestAnimationFrame(() => requestAnimationFrame(() => applyTransforms()));
                }
              }}
              className={cnCard}
              style={{
                left: c.rect.left,
                top: c.rect.top,
                width: c.rect.width,
                height: c.rect.height,
                zIndex: 100 - i,
                transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
                willChange: 'transform',
              }}
              dangerouslySetInnerHTML={{ __html: c.html }}
            />
          ))}
          {dragCount > 1 && (
            <div
              ref={badgeElRef}
              className="drag-stack-badge fixed left-0 top-0 z-[101]"
              style={{ opacity: 0, transition: 'opacity 150ms ease' }}
            >
              {dragCount}
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return { pressIcon, dragLayer };
}

// 卡片外观 — 布局类, 排版无文本 (角标样式集中在 globals.css 的 .drag-stack-badge)
// 克隆内容是 IconBlock 预览容器的 innerHTML (wrapper div + svg), 故用后代选择器
const cnCard = [
  'fixed flex items-center justify-center p-2',
  'rounded-xl border border-border bg-surface-elevated shadow-xl',
  '[&_svg]:w-full [&_svg]:h-full',
].join(' ');
