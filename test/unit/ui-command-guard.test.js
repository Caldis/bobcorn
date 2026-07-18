/**
 * UI Command Guard (W4-D1)
 *
 * 对话框命令收口守门：open/trigger 类跨组件通信必须走 store 的类型化命令面
 * (src/renderer/store/index.ts 的 openExportDialog / openSettings /
 * openProjectSettings / openMoveCopyDialog / requestImportIcons /
 * requestInstallUpdate)，不允许退回 `bobcorn:*` CustomEvent 通路。
 *
 * 两条规则：
 *   1. 已收口的 7 个事件名字符串不得在 src/ 与 scripts/ 复现（防回潮）。
 *      截图自动化 (scripts/screenshot.mjs) 也走 window.__BOBCORN_STORE__，
 *      见 docs/SCREENSHOT.md。
 *   2. 尚未收口的 6 个事件名（项目生命周期类 + 通知类，W4-D2/D3 范围）
 *      必须仍存在于 src/（防误删——它们的收发在本阶段必须原样保留）。
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const REPO_ROOT = join(__dirname, '../..');
const SCAN_DIRS = [join(REPO_ROOT, 'src'), join(REPO_ROOT, 'scripts')];

// W4-D1 已收口 — 这些事件名不得再出现（发端与听端都已迁移到 store 命令面）
const MIGRATED_EVENTS = [
  'bobcorn:import-icons',
  'bobcorn:open-export',
  'bobcorn:open-settings',
  'bobcorn:open-project-settings',
  'bobcorn:open-move-dialog',
  'bobcorn:open-copy-dialog',
  'bobcorn:install-update',
];

// W4-D2/D3 范围 — 项目生命周期类 + 通知类，本阶段必须原样保留在 src/。
// 用「事件名 + 收尾引号」匹配，避免 `bobcorn:open-project` 误命中
// `bobcorn:open-project-settings`、`bobcorn:save` 误命中 `bobcorn:save-as`。
const RETAINED_EVENTS = [
  'bobcorn:new-project',
  'bobcorn:open-project',
  'bobcorn:save',
  'bobcorn:save-as',
  'bobcorn:close-project',
  'bobcorn:export-triggered',
];

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function rel(file) {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

describe('UI command guard (W4-D1 对话框命令收口)', () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(dir));

  test('已收口的 7 个 bobcorn:* 事件名不得复现 (使用 store UI 命令面)', () => {
    const violations = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const event of MIGRATED_EVENTS) {
        if (!content.includes(event)) continue;
        content.split('\n').forEach((line, i) => {
          if (line.includes(event)) {
            violations.push(`${rel(file)}:${i + 1}: ${event}`);
          }
        });
      }
    }
    expect(
      violations,
      `已收口的 open/trigger 类 CustomEvent 事件名回潮 — 请改用 ` +
        `src/renderer/store/index.ts 的 UI 命令面 action ` +
        `(openExportDialog/openSettings/openProjectSettings/openMoveCopyDialog/` +
        `requestImportIcons/requestInstallUpdate):\n${violations.join('\n')}`
    ).toEqual([]);
  });

  test('未收口的 6 个 bobcorn:* 事件名仍存在于 src/ (D2/D3 范围, 防误删)', () => {
    const srcFiles = files.filter((f) => rel(f).startsWith('src/'));
    const corpus = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    const missing = RETAINED_EVENTS.filter(
      (event) => !new RegExp(`${event}['"\`]`).test(corpus)
    );
    expect(
      missing,
      `项目生命周期/通知类事件在 src/ 中消失了 — 它们属于 W4-D2/D3 收口范围, ` +
        `本阶段必须原样保留:\n${missing.join('\n')}`
    ).toEqual([]);
  });
});
