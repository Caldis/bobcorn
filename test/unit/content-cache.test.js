/**
 * Content Cache Invalidation
 *
 * 两部分:
 *   1. applyContentInvalidation 纯函数行为 — rev 递增 / patched+prefetched 清理 /
 *      空 ids 短路 / 不可变性
 *   2. 数据层广播接线守门 — 静态断言 renderer database 的内容写入路径
 *      (setIconData / updateIconsColor) 接入了 emitIconContentChanged, 且
 *      bootstrap 把广播桥接到 store.invalidateIconContent。防止后续重构
 *      悄悄拆掉失效收口, 让「画布不刷新」这类 bug 回归。
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { applyContentInvalidation } from '../../src/renderer/store/contentCache';

const REPO_ROOT = join(__dirname, '../..');

describe('applyContentInvalidation (纯函数)', () => {
  const baseSlice = () => ({
    iconContentRevs: { a: 2 },
    patchedIcons: { a: '<svg>old-a</svg>', b: '<svg>old-b</svg>' },
    prefetchedContent: { a: '<svg>pre-a</svg>', c: '<svg>pre-c</svg>' },
  });

  test('rev 递增: 已有条目 +1, 新条目从 1 开始', () => {
    const next = applyContentInvalidation(baseSlice(), ['a', 'x']);
    expect(next.iconContentRevs.a).toBe(3);
    expect(next.iconContentRevs.x).toBe(1);
  });

  test('清理对应 id 的 patched / prefetched 缓存, 不影响其他 id', () => {
    const next = applyContentInvalidation(baseSlice(), ['a']);
    expect(next.patchedIcons.a).toBeUndefined();
    expect(next.prefetchedContent.a).toBeUndefined();
    expect(next.patchedIcons.b).toBe('<svg>old-b</svg>');
    expect(next.prefetchedContent.c).toBe('<svg>pre-c</svg>');
  });

  test('空 ids 返回 null (调用方跳过 set)', () => {
    expect(applyContentInvalidation(baseSlice(), [])).toBeNull();
  });

  test('不可变: 原切片不被修改', () => {
    const slice = baseSlice();
    applyContentInvalidation(slice, ['a']);
    expect(slice.iconContentRevs.a).toBe(2);
    expect(slice.patchedIcons.a).toBe('<svg>old-a</svg>');
    expect(slice.prefetchedContent.a).toBe('<svg>pre-a</svg>');
  });

  test('同一 id 多次失效, rev 单调递增', () => {
    let slice = baseSlice();
    for (let i = 0; i < 3; i++) {
      slice = { ...slice, ...applyContentInvalidation(slice, ['a']) };
    }
    expect(slice.iconContentRevs.a).toBe(5);
  });
});

describe('数据层广播接线 (静态守门)', () => {
  const dbSource = readFileSync(join(REPO_ROOT, 'src/renderer/database/index.ts'), 'utf-8');
  const bootstrapSource = readFileSync(join(REPO_ROOT, 'src/renderer/bootstrap.tsx'), 'utf-8');
  const storeSource = readFileSync(join(REPO_ROOT, 'src/renderer/store/index.ts'), 'utf-8');

  test('setIconData 在 iconContent 写入时广播', () => {
    const body = dbSource.slice(dbSource.indexOf('setIconData ='));
    const fnBody = body.slice(0, body.indexOf('getIconData ='));
    expect(fnBody).toContain("'iconContent' in dataSet");
    expect(fnBody).toContain('emitIconContentChanged');
  });

  test('updateIconsColor 批量写入后一次性广播', () => {
    const body = dbSource.slice(dbSource.indexOf('updateIconsColor ='));
    const fnBody = body.slice(0, body.indexOf('setIconFavorite ='));
    expect(fnBody).toContain('suppressContentEmit');
    expect(fnBody).toContain('emitIconContentChanged(ids)');
  });

  test('bootstrap 把 db 广播桥接到 store.invalidateIconContent', () => {
    expect(bootstrapSource).toContain('registerOnIconContentChanged');
    expect(bootstrapSource).toContain('invalidateIconContent');
  });

  test('store.invalidateIconContent 走 applyContentInvalidation 并递增 iconContentVersion', () => {
    const body = storeSource.slice(storeSource.indexOf('invalidateIconContent:'));
    const fnBody = body.slice(0, body.indexOf('prefetchIconContent:'));
    expect(fnBody).toContain('applyContentInvalidation');
    expect(fnBody).toContain('iconContentVersion');
  });
});
