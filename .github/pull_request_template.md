## Description

<!-- What does this PR do? Why is it needed? -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Refactor (no functional change, code improvement)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Test improvement
- [ ] Build / CI change

## Modules Affected

<!-- Check all that apply — see docs/DEPENDENCY_MAP.md -->

- [ ] `src/main/` (main process)
- [ ] `src/preload/` (context bridge)
- [ ] `src/renderer/store/` (Zustand state)
- [ ] `src/renderer/database/` (sql.js data layer)
- [ ] `src/renderer/components/` — which: ___
- [ ] `src/renderer/utils/` — which: ___
- [ ] `src/renderer/config/`
- [ ] `test/`

## Acceptance Checklist

- [ ] `npx electron-vite build` succeeds with zero errors
- [ ] `npx vitest run` — unit tests passing
- [ ] `npx electron-vite build && node test/e2e/acceptance.js` — E2E 21/21
- [ ] No lint warnings (`npx eslint src/`)
- [ ] Security: no `nodeIntegration`, no `electron.remote`, SVG sanitized via `sanitizeSVG()`
- [ ] No secrets or credentials in diff
- [ ] Screenshots attached (if UI changed)
