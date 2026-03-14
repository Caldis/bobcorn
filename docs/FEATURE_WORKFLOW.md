# Feature Development Workflow

## 7-Step Process

### 1. Branch

```bash
git checkout -b feat/description main
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

```bash
# Build and preview
taskkill /f /im electron.exe 2>/dev/null
npx electron-vite build && npx electron-vite preview
```

Take screenshots of affected UI areas → save to `screenshots/`.

### 5. Run All Tests

```bash
# Unit
npx vitest run

# Lint
npm run lint

# E2E acceptance (20 checks)
npx electron-vite build && node test/e2e/acceptance.js
```

All 20 acceptance checks must pass. Zero page/console errors required.

### 6. Commit

```bash
git add <specific-files>
git commit -m "<type>: <description>"
```

Commit types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `security`, `plan`

### 7. Merge

```bash
git checkout main && git merge feat/description
```

Post-merge: re-run acceptance tests to confirm no regressions.

## Checklist

- [ ] Tests written and passing
- [ ] No ESLint errors (`npm run lint`)
- [ ] Build succeeds (`npx electron-vite build`)
- [ ] Acceptance tests pass (20/20)
- [ ] No page or console errors
- [ ] Screenshots captured for UI changes
