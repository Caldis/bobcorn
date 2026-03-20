# Feature Development Workflow

## 7-Step Process

### 1. Branch

```bash
git checkout -b feat/description master
```

Naming: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`

### 2. Write Tests First

Create test files before implementation:

- **Unit:** `test/unit/<module>.test.js` (Vitest)
- **E2E:** `test/e2e/<feature>.test.js` (Playwright)

```bash
npx vitest run test/unit/<module>.test.js
```

### 3. Implement

Edit files under `src/`. Follow conventions in [`CONVENTIONS.md`](./CONVENTIONS.md).

Key decisions:
- New component? Create `src/renderer/components/<Name>/index.jsx` + `index.module.css`
- New state? Add to `src/renderer/store/index.js`
- New IPC channel? Add handler in `main.js`, expose in `preload.js`
- Database schema change? Edit `database/index.js` `initNewProject()`

### 4. Visual Verification

开发时用 HMR 模式验证（renderer 改动自动生效）：
```bash
npx electron-vite dev
```

如涉及 main/preload 改动，需重启（先杀旧进程保持单实例）。

### 5. Run All Tests

```bash
# Unit (169 tests)
npx vitest run

# Lint
npm run lint

# E2E acceptance (21 checks, requires build)
npx electron-vite build && node test/e2e/acceptance.js

# Full E2E flow (15 steps, requires build)
node test/e2e/full-e2e.js

# Security audit
npm run security-audit
```

All tests must pass. Zero page/console errors required.

### 6. Commit

```bash
git add <specific-files>
git commit -m "<type>: <description>"
```

Commit types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `security`, `plan`

### 7. Merge

```bash
git checkout master && git merge feat/description
```

Post-merge: re-run acceptance tests to confirm no regressions.

## Checklist

- [ ] Tests written and passing
- [ ] No ESLint errors (`npm run lint`)
- [ ] Build succeeds (`npx electron-vite build`)
- [ ] Acceptance tests pass (21/21)
- [ ] No page or console errors
- [ ] Screenshots captured for UI changes
