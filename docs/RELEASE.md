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
    ↓                   创建 release + 上传全部资产
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
