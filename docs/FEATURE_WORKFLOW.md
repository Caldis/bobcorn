# Feature Development Workflow

> **CLI-first**: any new user operation is built in the core + CLI first, and the
> GUI is only a thin wrapper on top. See [`CLI.md`](./CLI.md) (收口清单) and
> [`MIGRATION.md`](./MIGRATION.md) (parity rules). New methods on
> `src/renderer/database/index.ts` are rejected by `core-parity-guard`.

## 7-Step Process

### 1. Branch

```bash
git checkout -b feat/description master
```

Naming: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`

### 2. Core operation + CLI + tests (CLI-first)

Build the capability headless before any UI exists:

- Implement the pure function in `src/core/operations/<domain>.ts` (receives
  `IoAdapter`; no `window`/`fs`/`electronAPI`/`import.meta.env`).
- Register it in `src/core/registry.ts` (`status: Core`, `corePath`, `cliCommand`).
- Expose the command in `src/cli/index.ts`.
- Write tests first: `test/cli/<domain>.test.ts` (CLI) + `test/unit/<module>.test.js`
  (Vitest). Run `npx vitest run test/unit/<module>.test.js`.

Do **not** add methods to `src/renderer/database/index.ts` — `core-parity-guard`
fails on new methods there.

### 3. GUI wrapper

Wire the UI on top of the core operation — a thin `src/renderer/store/index.js`
action calls `core.operations.*` then updates Zustand UI state; components call
the store action (never `database/` directly). Follow conventions in
[`CONVENTIONS.md`](./CONVENTIONS.md).

Key decisions:
- New component? Create `src/renderer/components/<Name>/index.jsx` + `index.module.css`
- New state? Add a thin action to `src/renderer/store/index.js`
- New IPC channel? Add handler in `main.js`, expose in `preload.js`
- Schema change? Edit both `src/core/database/index.ts` (`initSchema` + migration)
  and `src/renderer/database/index.ts` (`initNewProject`) so CLI and GUI agree

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

- [ ] New operation built CLI-first (core + registry + CLI) before the GUI wrapper; no new methods on renderer `database/`
- [ ] Tests written and passing
- [ ] No ESLint errors (`npm run lint`)
- [ ] Build succeeds (`npx electron-vite build`)
- [ ] Acceptance tests pass (21/21)
- [ ] No page or console errors
- [ ] Screenshots captured for UI changes
