// 画布图标内容缓存的失效逻辑 — 纯函数, 无 store/DOM 依赖, 供单测直接覆盖
//
// 背景: IconBlock 的显示内容取自多级缓存 (patchedIcons → prefetchedContent →
// props → 组件内 lazyContent)。历史上缓存失效由每个写入 callsite 手工重放,
// 漏一处画布就不刷新 (替换图标/批量改色都踩过)。现在失效收口到数据层:
// db 层 iconContent 写入后广播 → store.invalidateIconContent → 本函数。
//
// 失效语义: 对每个 id 递增 iconContentRevs (IconBlock 订阅自己的 rev, 变化后
// 丢弃本地 lazy 缓存并 idle 重载), 同时删除该 id 的 patched/prefetched 缓存条目
// (避免旧内容以更高优先级遮住新内容)。高频路径 (取色拖拽) 的写入方仍可在广播后
// 立刻 patchIconContent 注入新内容作为快路径, IconBlock 见到 patched 即跳过重查。

export interface ContentCacheSlice {
  iconContentRevs: Record<string, number>;
  patchedIcons: Record<string, string>;
  prefetchedContent: Record<string, string>;
}

/** 返回失效后的新切片; ids 为空时返回 null (调用方跳过 set, 避免无谓重渲染) */
export function applyContentInvalidation(
  slice: ContentCacheSlice,
  ids: string[]
): ContentCacheSlice | null {
  if (ids.length === 0) return null;
  const iconContentRevs = { ...slice.iconContentRevs };
  const patchedIcons = { ...slice.patchedIcons };
  const prefetchedContent = { ...slice.prefetchedContent };
  for (const id of ids) {
    iconContentRevs[id] = (iconContentRevs[id] || 0) + 1;
    delete patchedIcons[id];
    delete prefetchedContent[id];
  }
  return { iconContentRevs, patchedIcons, prefetchedContent };
}
