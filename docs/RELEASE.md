# Release Process

## When to Release

- After completing a phase/milestone (P0, P1, etc.)
- After accumulating 10+ commits since last release
- After fixing a critical bug

## Pre-Release Checklist

```bash
# 1. Ensure clean working tree
git status  # should be clean

# 2. Build
npx electron-vite build

# 2.5. Docs metadata
npm run docs:check

# 3. Unit tests (169 tests)
npx vitest run

# 4. E2E acceptance (21 checks)
node test/e2e/acceptance.js

# 5. Full E2E flow (15 steps)
node test/e2e/full-e2e.js

# 6. Security audit
npm run security-audit

# 7. Local package test (optional)
npm run package-win
```

所有测试必须全部通过 (0 失败) 才能发版。

## Release Steps

### 1. 生成 Changelog (AI 工作流)

发版前由 AI (Claude Code) 生成 changelog 条目：

```
1. AI 执行 git log <last-tag>..HEAD 分析 commits
2. 生成面向用户的 zh/en 描述 (非 commit message)
3. 生成 summary (简短摘要，用于 app 内更新卡片) 和 changes (详细列表，用于官网)
4. 写入 docs/changelog.json 顶部
```

`docs/changelog.json` 数据结构 (三用途 — 官网 + app 更新卡片 + GitHub Release body)：
```json
{
  "version": "1.x.x",
  "date": "YYYY-MM-DD",
  "summary": { "zh": "简短摘要", "en": "Brief summary" },
  "changes": { "zh": ["详细条目..."], "en": ["Detailed items..."] }
}
```

> **⚠️ 硬约束：当前版本必须有 changelog 条目，否则发版失败。**
> 稳定版发布时，CI 会校验 `docs/changelog.json` 顶部（或任一条目）存在与 `package.json` 版本匹配、且 `summary` 非空的条目：
> - 本地 `npm version` → `scripts/sync-site-release.js` 校验顶部条目版本一致（否则中止，不打 tag）。
> - CI `npm run docs:check`（`test` + `build` 两个 job 都跑）→ `scripts/check-site-release.js` 校验存在匹配条目且 summary 非空（否则整个 workflow 失败）。
> - CI `publish` job 的 "Generate release notes" 步骤用 `scripts/changelog-to-release-notes.js` 从该条目提取 Markdown 作为 **GitHub Release body**；稳定版找不到条目直接 `exit 1`，绝不发空说明的 release。
>
> 预发布（版本号含 `-`，如 `-beta`/`-alpha`/`-rc`）豁免此约束：CI 校验跳过，release body 回退为按 conventional commits 生成。
>
> **为什么**：electron-updater (GitHub provider) 把 Release body 作为 `updateInfo.releaseNotes` 下发给客户端，应用内更新卡片以此为兜底来源。Release body 为空 → 用户看到「暂无更新说明」（v1.13.0 曾出现此问题）。

### 2. 发版

```bash
# Patch release (bug fixes): 1.0.0 → 1.0.1
npm version patch

# Minor release (new features): 1.0.0 → 1.1.0
npm version minor

# Major release (breaking changes): 1.0.0 → 2.0.0
npm version major

# Push triggers CI → multi-platform build → GitHub Releases
git push origin master --follow-tags
```

`npm version` 会自动执行 `npm run docs:sync`，同步官网首页版本徽章、SEO `softwareVersion`、`docs/release.json`（含平台直链）。

**发版后不要手动创建 `gh release`** — CI 会自动处理。手动创建会导致 CI 产物丢失。

## CI 发布流程 (release.yml)

Tag push 触发 4 个阶段：

```
Phase 1: test        ← vitest 单元测试必须通过
    ↓
Phase 2: build       ← 3 平台并行构建 (win/mac/linux)
    ↓                   electron-builder --publish never (不直接上传)
    ↓                   构建产物存入 GitHub Actions artifacts
    ↓                   每个平台验证产物存在
    ↓
Phase 3: publish     ← 仅当 3 平台全部成功才运行
    ↓                   验证 3 平台产物齐全
    ↓                   从 docs/changelog.json 提取当前版本 release notes
    ↓                     (稳定版缺条目 → exit 1；预发布回退 commit 生成)
    ↓                   创建 release (body = release notes) + 上传全部资产
    ↓                   最终完整性校验 (exe/dmg/AppImage/latest*.yml)
```

**关键保障：**
- 任一平台构建失败 → publish job 不运行 → 不会发布残缺版本
- publish 前二次验证产物完整性
- 发布后三次验证 release 资产齐全
- 重复运行安全：自动清理旧 draft/release 后重建

## CI 失败处理

如果 CI 构建失败：

1. 查看 `gh run list --limit 3` 找到失败的 run
2. 查看 `gh run view <run-id> --log` 定位失败平台和原因
3. 修复代码并提交
4. 删除失败的 tag 并重新打 tag：
   ```bash
   git tag -d v1.x.x
   git push origin :refs/tags/v1.x.x
   npm version patch  # or re-tag manually
   git push origin master --follow-tags
   ```

## Version Scheme

- `1.0.0-rc.N` — release candidates (pre-release)
- `1.0.0` — stable release
- Patch: bug fixes, dependency updates
- Minor: new features
- Major: breaking changes (e.g., file format change)

## Troubleshooting

### electron-builder can't find out/
`out/` is in `.gitignore`. electron-builder's `files` config explicitly includes it.
If packaging fails, verify `out/` exists after `npx electron-vite build`.

### NSIS installer not generated
Code signing cache may have symlink issues on Windows.
Use `--config.win.sign=false` or run as admin.

### Auto-updater 404
Normal if no GitHub Release exists yet. Will resolve after first release.

### Release has no assets
**不要手动 `gh release create`**。让 CI 自动处理。如果 CI 失败，修复后删 tag 重来。
