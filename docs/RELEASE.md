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

# 3. Unit tests
npx vitest run

# 4. E2E acceptance
node test/e2e/acceptance.js  # 21/21 required

# 5. Full flow
node test/e2e/full-e2e.js  # 13/13 required

# 6. Security audit
npm run security-audit

# 7. Local package test (optional)
npm run package-win
```

## Release Steps

```bash
# Patch release (bug fixes): 1.0.0 → 1.0.1
npm version patch

# Minor release (new features): 1.0.0 → 1.1.0
npm version minor

# Major release (breaking changes): 1.0.0 → 2.0.0
npm version major

# Push triggers CI → multi-platform build → GitHub Releases
git push origin main --follow-tags
```

## What Happens Automatically

1. `npm version` creates a commit + git tag (e.g., `v1.0.1`)
2. `git push --follow-tags` pushes commit + tag to GitHub
3. GitHub Actions `release.yml` triggers on tag push
4. CI builds for Windows (x64), macOS (x64+arm64), Linux (deb+AppImage)
5. `electron-builder --publish always` uploads installers to GitHub Releases
6. Users with installed app receive auto-update notification via `electron-updater`

## Version Scheme

- `1.0.0-rc.N` — release candidates (pre-release)
- `1.0.0` — stable release
- Patch: bug fixes, dependency updates
- Minor: new features (e.g., icon marketplace)
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
