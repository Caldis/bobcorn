/**
 * Variant Guard — Stage C 形态 (批操作 action 守门)
 *
 * 守护意图与旧版一脉相承: 组件不得绕过变体级联决策直接调 db 的图标写方法。
 * 旧版要求组件先 checkVariants() 再写库 (utils/variantGuard, 已删除);
 * Stage C 后变体级联/越界重分配决策收口在 core 命令体 (src/core/commands/icon.ts),
 * 组件必须经 store 批操作 action 调用:
 *   planMove / planDelete            — 只读预检 (confirm 文案的变体/越界计数)
 *   moveIconsTo / copyIconsTo        — 移动 / 复制
 *   recycleIconsAction / deleteIconsPermanently — 回收 / 彻底删除
 * action 统一 dirty 标记与刷新, 警告经 utils/commandWarnings 映射为既有 i18n key。
 *
 * 静态扫描所有组件文件: 出现下列 db 写方法调用即失败 (必须走 store action) —
 *   db.moveIcon*      (moveIcons / moveIconsWithVariants / moveIconWithVariants / moveIconGroup)
 *   db.delIcon*       (delIcon / delIcons)
 *   db.duplicateIcon* (duplicateIcons / duplicateIconGroup)
 *   db.deleteIconWithVariants
 *
 * 注意: db.renewIconData (替换, W3-2a 已在数据层委托命令体) 与 db.deleteVariants
 * (变体面板/替换路径, 级联语义自含) 不在禁用之列 — 它们的收口在后续阶段处理。
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// 禁用的 db 写方法模式 — 命中即违规
const FORBIDDEN_METHODS = [
  { label: 'db.moveIcon*', re: /\bdb\.moveIcon\w*\s*\(/ },
  { label: 'db.delIcon*', re: /\bdb\.delIcon\w*\s*\(/ },
  { label: 'db.duplicateIcon*', re: /\bdb\.duplicateIcon\w*\s*\(/ },
  { label: 'db.deleteIconWithVariants', re: /\bdb\.deleteIconWithVariants\s*\(/ },
];

// 显式豁免 — "relative/path.tsx:方法标签 — 原因"
const ALLOWED_DIRECT = [
  // VariantPanel 删除的是变体自身: 变体无子变体, 不涉及级联决策 (与旧版豁免一致)
  'src/renderer/components/SideEditor/VariantPanel.tsx:db.delIcon* — 删除变体自身, 无子变体, 不涉及级联决策',
];

const COMPONENTS_DIR = join(__dirname, '../../src/renderer/components');

function getAllTsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllTsxFiles(full));
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('variant guard (batch actions via store)', () => {
  const files = getAllTsxFiles(COMPONENTS_DIR);

  test('all component files found', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const filePath of files) {
    const relPath = relative(join(__dirname, '../..'), filePath).replace(/\\/g, '/');

    test(`${relPath} — no direct db icon-mutation calls`, () => {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const violations = [];

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        for (const { label, re } of FORBIDDEN_METHODS) {
          if (!re.test(line)) continue;

          const isAllowed = ALLOWED_DIRECT.some(
            (entry) => entry.startsWith(`${relPath}:`) && entry.includes(label)
          );
          if (isAllowed) continue;

          violations.push(
            `Line ${lineNum}: ${label} called directly (${trimmed.slice(0, 100)}). ` +
              `Components must go through store batch actions ` +
              `(planMove/planDelete/moveIconsTo/copyIconsTo/recycleIconsAction/deleteIconsPermanently). ` +
              `If intentionally direct, add to ALLOWED_DIRECT in this test.`
          );
        }
      });

      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} direct icon mutation(s) in ${relPath}:\n` +
            violations.map((v) => `  - ${v}`).join('\n')
        );
      }
    });
  }
});
