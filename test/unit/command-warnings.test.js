/**
 * commandWarnings 映射层测试 — CommandWarning DTO → 既有 i18n key 的单点映射。
 *
 * 用 identity 风格的 t mock (返回 "key|count") 渲染成静态 HTML, 断言:
 * 1. (type, ctx) → key 的映射表正确 (同一 type 在不同语境下 key 不同)
 * 2. count 占位符透传给 t
 * 3. codes-reassigned 无预警语义 → null (组件用 Outcome.reassigned 拼 toast)
 * 4. warningsToNodes 过滤 null 条目
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  warningToNode,
  warningsToNodes,
  confirmContentWithWarnings,
} from '../../src/renderer/utils/commandWarnings';

/** identity t mock — 输出 "key|count" 便于断言映射结果 */
const t = (key, opts) => `${key}|${opts?.count}`;

function render(node) {
  return renderToStaticMarkup(node);
}

describe('commandWarnings', () => {
  describe('warningToNode key mapping', () => {
    it.each([
      // [type, ctx, expected i18n key]
      ['variant-follow', 'move', 'variant.moveNote'],
      ['variant-follow', 'recycle', 'variant.recycleNote'],
      ['variant-cascade-delete', 'delete', 'variant.deleteConfirm'],
      ['variant-cascade-delete', 'replace', 'variant.replaceWarn'],
      ['variant-not-copied', 'copy', 'variant.copyNote'],
    ])('%s + ctx=%s → %s', (type, ctx, expectedKey) => {
      const html = render(warningToNode({ type, count: 3 }, ctx, t));
      expect(html).toContain(`${expectedKey}|3`);
    });

    it('passes count through to t options', () => {
      const html = render(warningToNode({ type: 'variant-follow', count: 7 }, 'move', t));
      expect(html).toContain('variant.moveNote|7');
    });

    it('returns null for codes-reassigned (post-op outcome, not a pre-op warning)', () => {
      expect(warningToNode({ type: 'codes-reassigned', count: 2 }, 'move', t)).toBeNull();
    });

    it('renders the warning pill with an icon (svg) and semantic warning tokens', () => {
      const html = render(warningToNode({ type: 'variant-follow', count: 1 }, 'move', t));
      expect(html).toContain('<svg'); // TriangleAlert
      expect(html).toContain('text-warning');
      expect(html).toContain('bg-warning-subtle');
    });
  });

  describe('warningsToNodes', () => {
    it('maps every warning in context and filters out null entries', () => {
      const nodes = warningsToNodes(
        [
          { type: 'variant-follow', count: 2 },
          { type: 'codes-reassigned', count: 5 },
        ],
        'recycle',
        t
      );
      expect(nodes).toHaveLength(1);
      expect(render(nodes[0])).toContain('variant.recycleNote|2');
    });

    it('returns an empty array for no warnings', () => {
      expect(warningsToNodes([], 'move', t)).toEqual([]);
    });
  });

  describe('confirmContentWithWarnings', () => {
    it('returns the plain main string when there is nothing to warn about', () => {
      expect(confirmContentWithWarnings('main text', [], 'delete', t)).toBe('main text');
      // codes-reassigned 无预警语义 → 同样退化为纯文案
      expect(
        confirmContentWithWarnings('main text', [{ type: 'codes-reassigned', count: 2 }], 'move', t)
      ).toBe('main text');
    });

    it('stacks main text above the mapped warning pill(s)', () => {
      const html = render(
        confirmContentWithWarnings(
          'main text',
          [{ type: 'variant-cascade-delete', count: 4 }],
          'delete',
          t
        )
      );
      expect(html).toContain('main text');
      expect(html).toContain('variant.deleteConfirm|4');
      // 主文案在警告条之前 (上方)
      expect(html.indexOf('main text')).toBeLessThan(html.indexOf('variant.deleteConfirm|4'));
    });
  });
});
