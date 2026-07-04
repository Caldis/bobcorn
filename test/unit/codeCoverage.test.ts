/**
 * 字码覆盖纯逻辑单测 (src/renderer/components/SideMenu/codeCoverage.ts)
 *
 * 覆盖: normalizeIconCode 归一化、buildCoverageModel 块聚合/汇总统计/
 * 重复与非法处理、partialLevel 档位映射。
 */

import { describe, it, expect } from 'vitest';
import {
  PUA_START,
  PUA_END,
  PUA_TOTAL,
  BLOCK_SIZE,
  BLOCK_COUNT,
  normalizeIconCode,
  buildCoverageModel,
  partialLevel,
  auditIconCodes,
} from '../../src/renderer/components/SideMenu/codeCoverage';

/** 生成 [startHex, endHex] 闭区间内的全部 4 位 hex 码 */
function hexRange(startHex: string, endHex: string): string[] {
  const start = parseInt(startHex, 16);
  const end = parseInt(endHex, 16);
  return Array.from({ length: end - start + 1 }, (_, i) =>
    (start + i).toString(16).toUpperCase()
  );
}

describe('normalizeIconCode', () => {
  it('accepts PUA boundaries E000 and F8FF', () => {
    expect(normalizeIconCode('E000')).toBe(0xe000);
    expect(normalizeIconCode('F8FF')).toBe(0xf8ff);
  });

  it('accepts lowercase and surrounding whitespace', () => {
    expect(normalizeIconCode('e0a1')).toBe(0xe0a1);
    expect(normalizeIconCode(' E001 ')).toBe(0xe001);
  });

  it('rejects out-of-range codes DFFF / F900', () => {
    expect(normalizeIconCode('DFFF')).toBeNull();
    expect(normalizeIconCode('F900')).toBeNull();
  });

  it('rejects malformed values', () => {
    expect(normalizeIconCode('123')).toBeNull();
    expect(normalizeIconCode('E0000')).toBeNull();
    expect(normalizeIconCode('ZZZZ')).toBeNull();
    expect(normalizeIconCode('')).toBeNull();
    expect(normalizeIconCode(undefined)).toBeNull();
    expect(normalizeIconCode(null)).toBeNull();
  });
});

describe('buildCoverageModel — block aggregation', () => {
  it('empty input: all blocks empty, nextFree=E000, maxFreeRun=6400', () => {
    const { blocks, summary } = buildCoverageModel([]);
    expect(blocks).toHaveLength(BLOCK_COUNT);
    expect(blocks.every((b) => b.state === 'empty' && b.count === 0)).toBe(true);
    expect(summary.usedCount).toBe(0);
    expect(summary.usedPercent).toBe(0);
    expect(summary.nextFreeHex).toBe('E000');
    expect(summary.maxFreeRunLength).toBe(PUA_TOTAL);
    expect(summary.maxFreeRunStartHex).toBe('E000');
  });

  it('single code E000: block0 partial, nextFree=E001, maxFreeRun=6399', () => {
    const { blocks, summary } = buildCoverageModel(['E000']);
    expect(blocks[0]).toMatchObject({ count: 1, state: 'partial' });
    expect(summary.usedCount).toBe(1);
    expect(summary.nextFreeHex).toBe('E001');
    expect(summary.maxFreeRunLength).toBe(PUA_TOTAL - 1);
    expect(summary.maxFreeRunStartHex).toBe('E001');
  });

  it('full first block E000..E03F: block0 full, block1 empty, nextFree=E040', () => {
    const { blocks, summary } = buildCoverageModel(hexRange('E000', 'E03F'));
    expect(blocks[0]).toMatchObject({ count: BLOCK_SIZE, state: 'full' });
    expect(blocks[1]).toMatchObject({ count: 0, state: 'empty' });
    expect(summary.nextFreeHex).toBe('E040');
  });

  it('block boundary ownership: E03F→block0, E040→block1, F8FF→block99', () => {
    const { blocks } = buildCoverageModel(['E03F', 'E040', 'F8FF']);
    expect(blocks[0].count).toBe(1);
    expect(blocks[1].count).toBe(1);
    expect(blocks[99].count).toBe(1);
    expect(blocks[99].startHex).toBe('F8C0');
    expect(blocks[99].endHex).toBe('F8FF');
  });

  it('block metadata invariants: 100 blocks, 64 codes each, hex-aligned', () => {
    const { blocks } = buildCoverageModel([]);
    expect(blocks[0].startHex).toBe('E000');
    expect(blocks[0].endHex).toBe('E03F');
    for (const b of blocks) {
      expect(b.endDec - b.startDec).toBe(BLOCK_SIZE - 1);
      expect(b.startDec).toBe(PUA_START + b.index * BLOCK_SIZE);
    }
    expect(blocks[BLOCK_COUNT - 1].endDec).toBe(PUA_END);
  });
});

describe('buildCoverageModel — summary statistics', () => {
  it('completely full range: percent=100, nextFree=null, maxFreeRun=0', () => {
    const { blocks, summary } = buildCoverageModel(hexRange('E000', 'F8FF'));
    expect(blocks.every((b) => b.state === 'full')).toBe(true);
    expect(summary.usedCount).toBe(PUA_TOTAL);
    expect(summary.usedPercent).toBe(100);
    expect(summary.nextFreeHex).toBeNull();
    expect(summary.maxFreeRunLength).toBe(0);
    expect(summary.maxFreeRunStartHex).toBeNull();
  });

  it('single hole at E7A3: nextFree=E7A3, maxFreeRun=1', () => {
    const codes = hexRange('E000', 'F8FF').filter((c) => c !== 'E7A3');
    const { summary } = buildCoverageModel(codes);
    expect(summary.usedCount).toBe(PUA_TOTAL - 1);
    expect(summary.nextFreeHex).toBe('E7A3');
    expect(summary.maxFreeRunLength).toBe(1);
    expect(summary.maxFreeRunStartHex).toBe('E7A3');
  });

  it('free run spanning multiple blocks is measured correctly', () => {
    // 占用 E000..E01F 和 F800..F8FF, 中间 E020..E7FF... 全空
    const codes = [...hexRange('E000', 'E01F'), ...hexRange('F800', 'F8FF')];
    const { summary } = buildCoverageModel(codes);
    // 空闲段: E020..F7FF, 长度 = 0xF7FF - 0xE020 + 1 = 6112
    expect(summary.nextFreeHex).toBe('E020');
    expect(summary.maxFreeRunLength).toBe(0xf7ff - 0xe020 + 1);
    expect(summary.maxFreeRunStartHex).toBe('E020');
  });

  it('percent is rounded to one decimal: 237/6400 → 3.7', () => {
    const { summary } = buildCoverageModel(hexRange('E000', 'E0EC')); // 237 个
    expect(summary.usedCount).toBe(237);
    expect(summary.usedPercent).toBe(3.7);
  });
});

describe('buildCoverageModel — duplicates and invalid codes', () => {
  it('duplicate codes dedupe into usedCount and flag the block', () => {
    const { blocks, summary } = buildCoverageModel(['E000', 'E000', 'E001']);
    expect(summary.usedCount).toBe(2);
    expect(summary.duplicateCodeCount).toBe(1);
    expect(blocks[0].count).toBe(2);
    expect(blocks[0].hasDuplicates).toBe(true);
  });

  it('duplicates only flag their own block', () => {
    const { blocks } = buildCoverageModel(['E000', 'E000', 'E040']);
    expect(blocks[0].hasDuplicates).toBe(true);
    expect(blocks[1].hasDuplicates).toBe(false);
  });

  it('invalid codes are counted and excluded from all blocks', () => {
    const { blocks, summary } = buildCoverageModel(['E000', 'xyz', 'F900']);
    expect(summary.usedCount).toBe(1);
    expect(summary.invalidCodeCount).toBe(2);
    const totalInBlocks = blocks.reduce((sum, b) => sum + b.count, 0);
    expect(totalInBlocks).toBe(1);
  });
});

describe('auditIconCodes', () => {
  const icon = (id: string, name: string, code: string) => ({
    id,
    iconName: name,
    iconCode: code,
  });

  it('clean set → ok, no groups, no invalid', () => {
    const result = auditIconCodes([icon('1', 'a', 'E000'), icon('2', 'b', 'E001')]);
    expect(result.ok).toBe(true);
    expect(result.duplicateGroups).toEqual([]);
    expect(result.invalidIcons).toEqual([]);
  });

  it('duplicates grouped by code, first occupant listed first (cmap first-wins)', () => {
    const result = auditIconCodes([
      icon('1', 'first', 'E001'),
      icon('2', 'other', 'E002'),
      icon('3', 'second', 'E001'),
      icon('4', 'third', 'e001'), // 小写也归一化到同码
    ]);
    expect(result.ok).toBe(false);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].code).toBe('E001');
    expect(result.duplicateGroups[0].icons.map((i) => i.iconName)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('invalid and out-of-range codes are collected separately', () => {
    const result = auditIconCodes([
      icon('1', 'ok', 'E000'),
      icon('2', 'bad', 'ZZZZ'),
      icon('3', 'oob', 'F900'),
      icon('4', 'empty', ''),
    ]);
    expect(result.ok).toBe(false);
    expect(result.duplicateGroups).toEqual([]);
    expect(result.invalidIcons.map((i) => i.iconName)).toEqual(['bad', 'oob', 'empty']);
  });

  it('duplicate groups are sorted by code', () => {
    const result = auditIconCodes([
      icon('1', 'a', 'F000'),
      icon('2', 'b', 'F000'),
      icon('3', 'c', 'E100'),
      icon('4', 'd', 'E100'),
    ]);
    expect(result.duplicateGroups.map((g) => g.code)).toEqual(['E100', 'F000']);
  });
});

describe('partialLevel', () => {
  it('maps count to 4 opacity levels via ceil(count/16)', () => {
    expect(partialLevel(1)).toBe(1);
    expect(partialLevel(16)).toBe(1);
    expect(partialLevel(17)).toBe(2);
    expect(partialLevel(32)).toBe(2);
    expect(partialLevel(48)).toBe(3);
    expect(partialLevel(63)).toBe(4);
  });
});
