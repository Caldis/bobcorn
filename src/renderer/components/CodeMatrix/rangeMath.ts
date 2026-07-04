/**
 * CodeMatrix 纯逻辑 (零 React / 零 Tailwind 依赖, 便于单测)
 *
 * 负责码点 (十进制) ↔ 网格格子的换算、缩放档位、区间吸附/截断、
 * 直接输入的十六进制解析与校验。所有区间均以「闭区间 [start, end]」
 * 的十进制码点表示, UI 层再转十六进制显示。
 *
 * 刻意复用 codeCoverage 的 PUA 常量与 partialLevel, 不重复定义。
 */

import { PUA_START, PUA_END, PUA_TOTAL } from '../SideMenu/codeCoverage';

/**
 * 每格代表的码位数档位, 从粗到细 (64 档 = 项目设置现状的 100 格布局)。
 * range-select 网格固定 20 列 (与 display 模式一致), 故所有档位的总格数
 * (100/200/400/800) 均须是 20 的整数倍, 保证任何档位都不会有末行留空。
 */
export const ZOOM_LEVELS = [64, 32, 16, 8] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
/** 默认缩放 = 64 码/格, 与 display 模式保持一致。 */
export const DEFAULT_ZOOM = 64;
/** display 模式固定列数 (100 格 / 20 = 5 行)。 */
export const DISPLAY_GRID_COLS = 20;

export type CellState = 'empty' | 'partial' | 'full';

export interface CodeRange {
  start: number; // 十进制码点, 闭区间下界
  end: number; // 十进制码点, 闭区间上界
}

export interface ReservedRange {
  id: string;
  name: string;
  start: number;
  end: number;
}

export interface MatrixCell {
  index: number;
  startDec: number;
  endDec: number;
  startHex: string; // 恒 4 位大写
  endHex: string;
  count: number; // 格内被占用的去重码点数 (0..cellSize)
  cellSize: number; // = zoom, 每格码位数
  state: CellState;
  hasDuplicates: boolean; // 格内含撞码 (display 用)
  reserved: boolean; // 与某个 reservedRange 相交 (range-select 用, 不可选)
  reservedName: string | null; // 首个覆盖该格的分组名
  ownOutside: boolean; // 含本组已有码位但落在当前 value 区间之外 (编辑分组警示用)
}

/** 十进制码点 → 恒 4 位大写十六进制 (PUA 范围恒为 4 位, padStart 仅为稳妥)。 */
export const decToHex4 = (dec: number): string => dec.toString(16).toUpperCase().padStart(4, '0');

/** 给定缩放, 网格格子总数 (PUA_TOTAL 能被所有档位整除)。 */
export const cellCount = (zoom: number): number => PUA_TOTAL / zoom;

/** 码点是否落在 PUA 内。 */
export const inPua = (dec: number): boolean => dec >= PUA_START && dec <= PUA_END;

/** 十进制码点 → 该缩放下的格子下标。假定 dec 已在 PUA 内。 */
export const codeToCellIndex = (dec: number, zoom: number): number =>
  Math.floor((dec - PUA_START) / zoom);

/** 格子下标 → 其代表的闭区间 [startDec, endDec]。 */
export function cellRange(index: number, zoom: number): CodeRange {
  const start = PUA_START + index * zoom;
  return { start, end: start + zoom - 1 };
}

/** 两个闭区间是否相交。 */
export function rangesOverlap(a: CodeRange, b: CodeRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** 码点是否落在给定区间之外 (区间为 null 时视为「不受限」, 恒 false)。 */
function isOutsideRange(dec: number, range: CodeRange | null): boolean {
  return !!range && (dec < range.start || dec > range.end);
}

/**
 * 统计 codes (本组已有图标码位) 中落在 range 之外的数量, 供编辑分组时的
 * 「本组越界」警示计数。range 为 null (未设区间) 时恒为 0 —— 未设区间意味着
 * 当前草稿不对已有图标施加任何限制, 无需警示。
 */
export function countCodesOutsideRange(codes: Set<number>, range: CodeRange | null): number {
  if (!range) return 0;
  let n = 0;
  codes.forEach((dec) => {
    if (isOutsideRange(dec, range)) n++;
  });
  return n;
}

/**
 * 解析十六进制输入 (1..4 位, 允许小写/首尾空白)。
 * 非法格式返回 null; 不做 PUA 范围校验 (交给 validateRange)。
 */
export function parseHex(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const hex = raw.trim().toUpperCase();
  if (!/^[0-9A-F]{1,4}$/.test(hex)) return null;
  return parseInt(hex, 16);
}

export type RangeError = 'format' | 'range' | 'order' | 'overlap';
export type RangeValidation = { ok: true; range: CodeRange } | { ok: false; error: RangeError };

/**
 * 校验直接输入的起止十六进制:
 *  - format : 非法十六进制
 *  - range  : 越出 PUA (E000–F8FF)
 *  - order  : start > end
 *  - overlap: 与任一 reservedRange 相交
 */
export function validateRange(
  startHex: string,
  endHex: string,
  reservedRanges: ReservedRange[] = []
): RangeValidation {
  const s = parseHex(startHex);
  const e = parseHex(endHex);
  if (s === null || e === null) return { ok: false, error: 'format' };
  if (!inPua(s) || !inPua(e)) return { ok: false, error: 'range' };
  if (s > e) return { ok: false, error: 'order' };
  const range = { start: s, end: e };
  for (const r of reservedRanges) {
    if (rangesOverlap(range, r)) return { ok: false, error: 'overlap' };
  }
  return { ok: true, range };
}

/**
 * 拖拽/点击框选: 从 anchor 格子朝 cursor 方向延伸, 吸附到格子边界,
 * 遇到第一个 blocked (reserved) 格子即在其前截断。
 *
 * 截断策略 = 「锚点方向延伸」: 选区必为包含锚点的、连续的、无 reserved
 * 的格子段。若锚点本身落在 reserved 上则返回 null (不可从 reserved 起选)。
 * 天然吸附到当前缩放档的十六进制整倍数边界, 满足「整数区间便于记忆」。
 */
export function selectRange(
  anchorIdx: number,
  cursorIdx: number,
  zoom: number,
  blockedIdx: Set<number>
): CodeRange | null {
  if (blockedIdx.has(anchorIdx)) return null;
  let lo = anchorIdx;
  let hi = anchorIdx;
  if (cursorIdx >= anchorIdx) {
    let i = anchorIdx;
    while (i + 1 <= cursorIdx && !blockedIdx.has(i + 1)) i++;
    hi = i;
  } else {
    let i = anchorIdx;
    while (i - 1 >= cursorIdx && !blockedIdx.has(i - 1)) i--;
    lo = i;
  }
  return { start: PUA_START + lo * zoom, end: PUA_START + (hi + 1) * zoom - 1 };
}

export interface BuildCellsParams {
  usedCodes: Set<number>;
  duplicateCodes?: Set<number>;
  reservedRanges?: ReservedRange[];
  /** 本组已有图标的码位 (编辑分组警示用); 须同时提供 value 才会计算 ownOutside。 */
  ownCodes?: Set<number>;
  /** 当前草稿区间 (range-select 受控 value); 为 null/省略时不计算 ownOutside。 */
  value?: CodeRange | null;
  zoom: number;
}

/**
 * 由「已用码位 + 撞码 + 其他分组预留区间 + 缩放」构建网格模型。
 * O(cellCount + usedCodes + duplicateCodes + Σ reservedCells)。
 */
export function buildCells(params: BuildCellsParams): MatrixCell[] {
  const { usedCodes, duplicateCodes, reservedRanges, ownCodes, value, zoom } = params;
  const size = zoom;
  const n = cellCount(zoom);

  const cells: MatrixCell[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const startDec = PUA_START + i * size;
    const endDec = startDec + size - 1;
    cells[i] = {
      index: i,
      startDec,
      endDec,
      startHex: decToHex4(startDec),
      endHex: decToHex4(endDec),
      count: 0,
      cellSize: size,
      state: 'empty',
      hasDuplicates: false,
      reserved: false,
      reservedName: null,
      ownOutside: false,
    };
  }

  usedCodes.forEach((dec) => {
    if (inPua(dec)) cells[codeToCellIndex(dec, size)].count += 1;
  });

  duplicateCodes?.forEach((dec) => {
    if (inPua(dec)) cells[codeToCellIndex(dec, size)].hasDuplicates = true;
  });

  if (reservedRanges) {
    for (const r of reservedRanges) {
      const rs = Math.max(PUA_START, Math.min(r.start, r.end));
      const re = Math.min(PUA_END, Math.max(r.start, r.end));
      if (re < PUA_START || rs > PUA_END) continue;
      const from = codeToCellIndex(rs, size);
      const to = codeToCellIndex(re, size);
      for (let i = from; i <= to; i++) {
        cells[i].reserved = true;
        if (cells[i].reservedName === null) cells[i].reservedName = r.name;
      }
    }
  }

  if (ownCodes && value) {
    ownCodes.forEach((dec) => {
      if (inPua(dec) && isOutsideRange(dec, value)) {
        cells[codeToCellIndex(dec, size)].ownOutside = true;
      }
    });
  }

  for (const cell of cells) {
    cell.state = cell.count === 0 ? 'empty' : cell.count >= size ? 'full' : 'partial';
  }

  return cells;
}

/** 归一化 usedCodes: 数组或 Set → Set。 */
export function toCodeSet(codes: Set<number> | number[]): Set<number> {
  return codes instanceof Set ? codes : new Set(codes);
}
