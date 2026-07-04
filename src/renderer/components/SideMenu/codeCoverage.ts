/**
 * 字码覆盖 (Code Coverage) 纯计算逻辑
 *
 * 将项目中全部 iconCode 原始值 (含回收站/已删除/变体) 聚合为
 * PUA 区 (E000-F8FF, 共 6400 个码点) 的方块覆盖模型。
 *
 * 刻意零依赖:
 * - 不 import config (其 publicRangeUnicodeDecList 只有 6399 项, off-by-one)
 * - 不 import utils/tools (含全局副作用), hex 转换本地实现
 */

export const PUA_START = 0xe000; // 57344
export const PUA_END = 0xf8ff; // 63743
export const PUA_TOTAL = PUA_END - PUA_START + 1; // 6400
export const BLOCK_SIZE = 64; // 0x40, hex 对齐
export const BLOCK_COUNT = PUA_TOTAL / BLOCK_SIZE; // 100
export const GRID_COLS = 20;

export type BlockState = 'empty' | 'partial' | 'full';

export interface CoverageBlock {
  index: number; // 0..99
  startDec: number;
  endDec: number;
  startHex: string; // 恒 4 位大写, 如 'E000'
  endHex: string; // 如 'E03F'
  count: number; // 块内被占用码点数 (去重后), 0..64
  state: BlockState;
  hasDuplicates: boolean; // 块内存在被 >=2 行占用的码点
}

export interface CoverageSummary {
  usedCount: number; // 去重后已用码点数 (仅 PUA 范围内)
  totalCount: number; // 6400
  usedPercent: number; // 0..100, 一位小数
  nextFreeHex: string | null; // 最小可用码点; 全满时 null
  maxFreeRunLength: number; // 最大连续空闲段长度; 全满为 0
  maxFreeRunStartHex: string | null; // 最大空闲段起始码点
  duplicateCodeCount: number; // 被重复占用的码点个数 (按码点计, 非行数)
  invalidCodeCount: number; // 非法/越界 iconCode 的行数
}

export interface CoverageModel {
  blocks: CoverageBlock[]; // 恒 100 项
  summary: CoverageSummary;
}

const decToHex = (dec: number): string => dec.toString(16).toUpperCase();

/**
 * 归一化 iconCode: trim + 大写 + 4 位 hex 校验 + PUA 范围校验。
 * 非法或越界返回 null。
 */
export function normalizeIconCode(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const hex = raw.trim().toUpperCase();
  if (!/^[0-9A-F]{4}$/.test(hex)) return null;
  const dec = parseInt(hex, 16);
  return dec >= PUA_START && dec <= PUA_END ? dec : null;
}

/** partial 状态的填充档位: count (1..63) -> 1..4, 供组件映射透明度 */
export function partialLevel(count: number): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(1, Math.ceil(count / 16))) as 1 | 2 | 3 | 4;
}

// ── 图标级字码审计 (供导出门禁 / 导入审计 / 一键修复共用) ──────────

export interface AuditedIcon {
  id: string;
  iconName: string;
  iconCode: string;
}

export interface DuplicateCodeGroup {
  code: string; // 归一化后的 4 位大写 hex
  icons: AuditedIcon[]; // >= 2 项; 第一项为字体 cmap 中的实际保留者 (svg2ttf 先到先得)
}

export interface CodeAuditResult {
  duplicateGroups: DuplicateCodeGroup[];
  invalidIcons: AuditedIcon[]; // 非法或越界字码
  ok: boolean; // 无重复且无非法
}

/**
 * 审计一组图标的字码。输入顺序必须与字体生成时的图标顺序一致 —
 * 重复组的第一项即 svg2ttf cmap 先到先得的保留者。
 */
export function auditIconCodes(icons: AuditedIcon[]): CodeAuditResult {
  const byCode = new Map<number, AuditedIcon[]>();
  const invalidIcons: AuditedIcon[] = [];
  for (const icon of icons) {
    const dec = normalizeIconCode(icon.iconCode);
    if (dec === null) {
      invalidIcons.push(icon);
    } else {
      const list = byCode.get(dec);
      if (list) list.push(icon);
      else byCode.set(dec, [icon]);
    }
  }
  const duplicateGroups: DuplicateCodeGroup[] = [];
  byCode.forEach((list, dec) => {
    if (list.length > 1) duplicateGroups.push({ code: decToHex(dec), icons: list });
  });
  duplicateGroups.sort((a, b) => (a.code < b.code ? -1 : 1));
  return {
    duplicateGroups,
    invalidIcons,
    ok: duplicateGroups.length === 0 && invalidIcons.length === 0,
  };
}

/** 主入口: 原始 iconCode 列表 -> 完整覆盖模型。O(n + 6400) */
export function buildCoverageModel(rawCodes: string[]): CoverageModel {
  // 1. 归一化 + 统计每个码点的占用行数
  const occurrences = new Map<number, number>();
  let invalidCodeCount = 0;
  for (const raw of rawCodes) {
    const dec = normalizeIconCode(raw);
    if (dec === null) {
      invalidCodeCount += 1;
    } else {
      occurrences.set(dec, (occurrences.get(dec) || 0) + 1);
    }
  }

  // 2. 初始化 100 个块
  const blocks: CoverageBlock[] = [];
  for (let i = 0; i < BLOCK_COUNT; i++) {
    const startDec = PUA_START + i * BLOCK_SIZE;
    blocks.push({
      index: i,
      startDec,
      endDec: startDec + BLOCK_SIZE - 1,
      startHex: decToHex(startDec),
      endHex: decToHex(startDec + BLOCK_SIZE - 1),
      count: 0,
      state: 'empty',
      hasDuplicates: false,
    });
  }

  // 3. 单次扫描全区间: 块聚合 + 首个空闲 + 最大连续空闲段
  let nextFreeDec: number | null = null;
  let maxFreeRunLength = 0;
  let maxFreeRunStartDec: number | null = null;
  let runStart = -1;

  const closeRun = (endExclusive: number) => {
    const len = endExclusive - runStart;
    if (len > maxFreeRunLength) {
      maxFreeRunLength = len;
      maxFreeRunStartDec = runStart;
    }
    runStart = -1;
  };

  for (let dec = PUA_START; dec <= PUA_END; dec++) {
    const hits = occurrences.get(dec) || 0;
    if (hits > 0) {
      const block = blocks[(dec - PUA_START) >> 6];
      block.count += 1;
      if (hits > 1) block.hasDuplicates = true;
      if (runStart >= 0) closeRun(dec);
    } else {
      if (nextFreeDec === null) nextFreeDec = dec;
      if (runStart < 0) runStart = dec;
    }
  }
  if (runStart >= 0) closeRun(PUA_END + 1);

  for (const block of blocks) {
    block.state = block.count === 0 ? 'empty' : block.count === BLOCK_SIZE ? 'full' : 'partial';
  }

  // 4. 汇总
  let duplicateCodeCount = 0;
  occurrences.forEach((hits) => {
    if (hits > 1) duplicateCodeCount += 1;
  });

  const usedCount = occurrences.size;
  return {
    blocks,
    summary: {
      usedCount,
      totalCount: PUA_TOTAL,
      usedPercent: Math.round((usedCount / PUA_TOTAL) * 1000) / 10,
      nextFreeHex: nextFreeDec === null ? null : decToHex(nextFreeDec),
      maxFreeRunLength,
      maxFreeRunStartHex: maxFreeRunStartDec === null ? null : decToHex(maxFreeRunStartDec),
      duplicateCodeCount,
      invalidCodeCount,
    },
  };
}
