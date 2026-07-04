/**
 * CodeMatrix 区间选择纯逻辑单测
 * (src/renderer/components/CodeMatrix/rangeMath.ts)
 *
 * 覆盖: 缩放档位/格数 (含 20 列整除性)、码点↔格子换算、十六进制解析、
 * 区间校验 (格式/越界/顺序/重叠)、拖选吸附与 reserved 截断、buildCells 网格聚合、
 * 编辑分组「本组越界」警示 (ownOutside / countCodesOutsideRange)。
 */

import { describe, it, expect } from 'vitest';
import {
  PUA_START,
  PUA_END,
  PUA_TOTAL,
} from '../../src/renderer/components/SideMenu/codeCoverage';
import {
  ZOOM_LEVELS,
  DEFAULT_ZOOM,
  cellCount,
  decToHex4,
  parseHex,
  codeToCellIndex,
  cellRange,
  rangesOverlap,
  validateRange,
  selectRange,
  buildCells,
  toCodeSet,
  countCodesOutsideRange,
} from '../../src/renderer/components/CodeMatrix/rangeMath';

describe('zoom levels & cell count', () => {
  it('exposes coarse→fine zoom levels with 64 default', () => {
    expect([...ZOOM_LEVELS]).toEqual([64, 32, 16, 8]);
    expect(DEFAULT_ZOOM).toBe(64);
  });

  it('cellCount = PUA_TOTAL / zoom for every level', () => {
    expect(cellCount(64)).toBe(100);
    expect(cellCount(32)).toBe(200);
    expect(cellCount(16)).toBe(400);
    expect(cellCount(8)).toBe(800);
    expect(cellCount(1)).toBe(PUA_TOTAL); // 6400, 通用工具函数不受 ZOOM_LEVELS 限制
    for (const z of ZOOM_LEVELS) {
      expect(cellCount(z) * z).toBe(PUA_TOTAL);
    }
  });

  it('every zoom level cell count is a multiple of the fixed 20-column range-select grid', () => {
    // range-select 网格固定 20 列 (与 display 模式一致), 保证任何档位都不会有末行留空。
    for (const z of ZOOM_LEVELS) {
      expect(cellCount(z) % 20).toBe(0);
    }
  });
});

describe('decToHex4', () => {
  it('renders 4-digit uppercase PUA hex', () => {
    expect(decToHex4(PUA_START)).toBe('E000');
    expect(decToHex4(0xe03f)).toBe('E03F');
    expect(decToHex4(PUA_END)).toBe('F8FF');
  });
});

describe('parseHex', () => {
  it('accepts 1..4 digit hex, lowercase, whitespace', () => {
    expect(parseHex('E000')).toBe(0xe000);
    expect(parseHex(' e1ff ')).toBe(0xe1ff);
    expect(parseHex('F')).toBe(0xf);
  });
  it('rejects malformed / too long / non-string', () => {
    expect(parseHex('E0000')).toBeNull();
    expect(parseHex('ZZ')).toBeNull();
    expect(parseHex('')).toBeNull();
    expect(parseHex(undefined)).toBeNull();
    expect(parseHex(123 as unknown)).toBeNull();
  });
});

describe('codeToCellIndex & cellRange', () => {
  it('maps codes to cells at zoom 64 (block boundaries)', () => {
    expect(codeToCellIndex(0xe03f, 64)).toBe(0);
    expect(codeToCellIndex(0xe040, 64)).toBe(1);
    expect(codeToCellIndex(PUA_END, 64)).toBe(99);
  });
  it('maps codes to cells at zoom 8 (finest supported granularity)', () => {
    expect(codeToCellIndex(PUA_START, 8)).toBe(0);
    expect(codeToCellIndex(PUA_START + 7, 8)).toBe(0);
    expect(codeToCellIndex(PUA_START + 8, 8)).toBe(1);
    expect(codeToCellIndex(PUA_END, 8)).toBe(cellCount(8) - 1); // 799
  });
  it('cellRange inverts index → [startDec, endDec]', () => {
    expect(cellRange(0, 64)).toEqual({ start: 0xe000, end: 0xe03f });
    expect(cellRange(99, 64)).toEqual({ start: 0xf8c0, end: 0xf8ff });
    expect(cellRange(0, 8)).toEqual({ start: 0xe000, end: 0xe007 });
    expect(cellRange(cellCount(8) - 1, 8)).toEqual({ start: 0xf8f8, end: 0xf8ff });
  });
});

describe('rangesOverlap', () => {
  it('detects overlap and adjacency correctly', () => {
    expect(rangesOverlap({ start: 1, end: 5 }, { start: 5, end: 9 })).toBe(true); // touch
    expect(rangesOverlap({ start: 1, end: 4 }, { start: 5, end: 9 })).toBe(false); // adjacent
    expect(rangesOverlap({ start: 1, end: 10 }, { start: 3, end: 4 })).toBe(true); // contained
  });
});

describe('validateRange', () => {
  it('accepts a valid in-PUA range', () => {
    const r = validateRange('E100', 'E1FF');
    expect(r).toEqual({ ok: true, range: { start: 0xe100, end: 0xe1ff } });
  });
  it('flags format errors', () => {
    expect(validateRange('ZZ', 'E100')).toEqual({ ok: false, error: 'format' });
  });
  it('flags out-of-PUA (below E000 / above F8FF)', () => {
    expect(validateRange('DFFF', 'E100')).toEqual({ ok: false, error: 'range' });
    expect(validateRange('E100', 'F900')).toEqual({ ok: false, error: 'range' });
  });
  it('flags start > end', () => {
    expect(validateRange('E200', 'E100')).toEqual({ ok: false, error: 'order' });
  });
  it('flags overlap with a reserved range', () => {
    const reserved = [{ id: 'g1', name: 'A', start: 0xe100, end: 0xe1ff }];
    expect(validateRange('E150', 'E250', reserved)).toEqual({
      ok: false,
      error: 'overlap',
    });
  });
  it('allows a range adjacent to (not overlapping) a reserved range', () => {
    const reserved = [{ id: 'g1', name: 'A', start: 0xe100, end: 0xe1ff }];
    const r = validateRange('E200', 'E2FF', reserved);
    expect(r.ok).toBe(true);
  });
});

describe('selectRange — drag / click with snapping & truncation', () => {
  const NONE = new Set<number>();

  it('single click selects the whole cell (snapped to boundaries)', () => {
    expect(selectRange(0, 0, 64, NONE)).toEqual({ start: 0xe000, end: 0xe03f });
  });
  it('forward drag spans anchor..cursor cells', () => {
    // cells 0,1,2 at zoom 64 → E000 .. E0BF
    expect(selectRange(0, 2, 64, NONE)).toEqual({ start: 0xe000, end: 0xe0bf });
  });
  it('reverse drag is symmetric', () => {
    expect(selectRange(2, 0, 64, NONE)).toEqual({ start: 0xe000, end: 0xe0bf });
  });
  it('forward drag truncates before the first reserved cell', () => {
    // blocked at cell 3 → forward from 0 stops at cell 2
    expect(selectRange(0, 5, 64, new Set([3]))).toEqual({
      start: 0xe000,
      end: 0xe0bf,
    });
  });
  it('reverse drag truncates before the first reserved cell', () => {
    // anchor 5, drag left toward 0, blocked at 3 → stops at cell 4
    expect(selectRange(5, 0, 64, new Set([3]))).toEqual({
      start: 0xe100,
      end: 0xe17f,
    });
  });
  it('returns null when the anchor cell itself is reserved', () => {
    expect(selectRange(3, 7, 64, new Set([3]))).toBeNull();
  });
  it('snaps to 8-code cells at the finest zoom (8)', () => {
    expect(selectRange(0, 3, 8, NONE)).toEqual({ start: 0xe000, end: 0xe01f });
  });
});

describe('buildCells — grid aggregation', () => {
  it('empty input → all cells empty at zoom 64', () => {
    const cells = buildCells({ usedCodes: new Set(), zoom: 64 });
    expect(cells).toHaveLength(100);
    expect(cells.every((c) => c.state === 'empty' && c.count === 0)).toBe(true);
    expect(cells[0]).toMatchObject({ startHex: 'E000', endHex: 'E03F', cellSize: 64 });
    expect(cells[99]).toMatchObject({ startHex: 'F8C0', endHex: 'F8FF' });
  });

  it('counts used codes per cell and derives partial/full state', () => {
    const used = new Set<number>();
    for (let d = 0xe000; d <= 0xe03f; d++) used.add(d); // fill cell 0
    used.add(0xe040); // one code in cell 1
    const cells = buildCells({ usedCodes: used, zoom: 64 });
    expect(cells[0]).toMatchObject({ count: 64, state: 'full' });
    expect(cells[1]).toMatchObject({ count: 1, state: 'partial' });
  });

  it('at the finest zoom (8) a cell is only full once all 8 codes are used', () => {
    const cellStart = 0xe000 + 8 * 5; // cell 5's lower bound
    const used = new Set<number>();
    for (let d = cellStart; d < cellStart + 8; d++) used.add(d); // fully fill cell 5
    used.add(cellStart + 8); // single code in the next cell → stays partial
    const cells = buildCells({ usedCodes: used, zoom: 8 });
    expect(cells[5]).toMatchObject({ count: 8, state: 'full', startHex: decToHex4(cellStart) });
    expect(cells[6]).toMatchObject({ count: 1, state: 'partial' });
    expect(cells[4].state).toBe('empty');
  });

  it('flags duplicates on the owning cell only', () => {
    const cells = buildCells({
      usedCodes: new Set([0xe000, 0xe040]),
      duplicateCodes: new Set([0xe000]),
      zoom: 64,
    });
    expect(cells[0].hasDuplicates).toBe(true);
    expect(cells[1].hasDuplicates).toBe(false);
  });

  it('marks reserved cells and records the first covering group name', () => {
    const cells = buildCells({
      usedCodes: new Set(),
      reservedRanges: [{ id: 'g1', name: 'Weather', start: 0xe080, end: 0xe0ff }],
      zoom: 64,
    });
    // 0xE080..0xE0FF at zoom 64 → cells 2 and 3
    expect(cells[2]).toMatchObject({ reserved: true, reservedName: 'Weather' });
    expect(cells[3]).toMatchObject({ reserved: true, reservedName: 'Weather' });
    expect(cells[1].reserved).toBe(false);
    expect(cells[4].reserved).toBe(false);
  });

  it('marks a cell reserved even on partial overlap (conservative)', () => {
    // 0xE030..0xE050 straddles the cell0/cell1 boundary (cell0 = E000..E03F)
    const cells = buildCells({
      usedCodes: new Set(),
      reservedRanges: [{ id: 'g1', name: 'A', start: 0xe030, end: 0xe050 }],
      zoom: 64,
    });
    expect(cells[0].reserved).toBe(true); // 0xE030..0xE03F fall in cell 0
    expect(cells[1].reserved).toBe(true); // 0xE040..0xE050 fall in cell 1
    expect(cells[2].reserved).toBe(false);
  });

  it('ignores out-of-PUA used codes', () => {
    const cells = buildCells({ usedCodes: new Set([0xdfff, 0xf900]), zoom: 64 });
    expect(cells.every((c) => c.count === 0)).toBe(true);
  });

  describe('ownOutside (编辑分组「本组越界」警示)', () => {
    it('flags cells whose own code falls outside the drafted value range', () => {
      const cells = buildCells({
        usedCodes: new Set([0xe000, 0xe100]),
        ownCodes: new Set([0xe000, 0xe100]),
        value: { start: 0xe0c0, end: 0xe1ff }, // excludes 0xE000 (cell 0)
        zoom: 64,
      });
      expect(cells[0].ownOutside).toBe(true); // 0xE000 falls outside value
      expect(cells[4].ownOutside).toBe(false); // 0xE100 falls inside value (cell 4 = E100..E13F)
    });

    it('does not flag anything when value is null (no draft restriction yet)', () => {
      const cells = buildCells({
        usedCodes: new Set([0xe000]),
        ownCodes: new Set([0xe000]),
        value: null,
        zoom: 64,
      });
      expect(cells.every((c) => !c.ownOutside)).toBe(true);
    });

    it('does not flag anything when ownCodes is omitted', () => {
      const cells = buildCells({
        usedCodes: new Set([0xe000]),
        value: { start: 0xe100, end: 0xe1ff },
        zoom: 64,
      });
      expect(cells.every((c) => !c.ownOutside)).toBe(true);
    });
  });
});

describe('countCodesOutsideRange', () => {
  it('returns 0 when range is null (draft has no restriction)', () => {
    expect(countCodesOutsideRange(new Set([0xe000, 0xf000]), null)).toBe(0);
  });

  it('counts own codes falling outside the given range', () => {
    const codes = new Set([0xe000, 0xe100, 0xe200]);
    const range = { start: 0xe100, end: 0xe1ff };
    expect(countCodesOutsideRange(codes, range)).toBe(2); // E000 and E200 fall outside
  });

  it('returns 0 when every code falls inside the range', () => {
    const codes = new Set([0xe110, 0xe120]);
    const range = { start: 0xe100, end: 0xe1ff };
    expect(countCodesOutsideRange(codes, range)).toBe(0);
  });
});

describe('toCodeSet', () => {
  it('passes through a Set and wraps an array', () => {
    const s = new Set([1, 2]);
    expect(toCodeSet(s)).toBe(s);
    expect([...toCodeSet([3, 4])]).toEqual([3, 4]);
  });
});
