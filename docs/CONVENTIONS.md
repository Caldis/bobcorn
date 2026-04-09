# Code Conventions

## Components

### Functional + Hooks Only

All components must be functional. No class components.

```jsx
// CORRECT
function MyComponent({ value }) {
  const [state, setState] = useState(null);
  return <div>{value}</div>;
}

// WRONG — do not use
class MyComponent extends React.Component { ... }
```

### CSS Modules

Every component uses co-located CSS modules: `index.module.css`.

```jsx
import styles from './index.module.css';
// Access: styles.myClass (camelCase, configured in electron.vite.config.js)
```

Config (in `electron.vite.config.js`):
- `localsConvention: 'camelCaseOnly'`
- `generateScopedName: '[name]__[local]__[hash:base64:5]'`

### File Structure

```
src/renderer/components/MyComponent/
  index.jsx          # Component logic
  index.module.css   # Scoped styles
```

## State Management (Zustand)

Single store at `src/renderer/store/index.js`. Access via hook:

```jsx
import useAppStore from '../../store';

function MyComponent() {
  // Select individual values (prevents unnecessary re-renders)
  const value = useAppStore(state => state.someValue);
  const action = useAppStore(state => state.someAction);
}
```

Rules:
- Never use GlobalEvent, EventEmitter, or custom pub/sub
- All shared state lives in the store
- Component-local state uses `useState`

## Security

### SVG Sanitization

All SVG content displayed in the UI **must** pass through `sanitizeSVG()` (DOMPurify).

```jsx
import { sanitizeSVG } from '../../utils/sanitize';
<div dangerouslySetInnerHTML={{ __html: sanitizeSVG(svgContent) }} />
```

### IPC Communication

Renderer cannot access Node.js directly. All Node access goes through the preload bridge.

```
Main Process (main.js)          Preload (preload.js)           Renderer
ipcMain.on('channel', handler)  →   contextBridge.exposeInMainWorld  →  window.electronAPI.method()
ipcMain.handle('channel', fn)   →   ipcRenderer.invoke('channel')   →  await window.electronAPI.method()
```

Patterns:
- **Fire-and-forget:** `ipcRenderer.send()` → `ipcMain.on()`
- **Sync return:** `ipcRenderer.sendSync()` → `event.returnValue = ...`
- **Async return:** `ipcRenderer.invoke()` → `ipcMain.handle()`

### Image Imports

All images must use ES imports (Vite requirement):

```jsx
// CORRECT
import logo from '../../resources/logo.png';
<img src={logo} />

// WRONG
<img src="../../resources/logo.png" />
```

## Database

- `sql.js` uses ASM build (no WASM file needed)
- Async init: `bootstrap.jsx` awaits `dbReady` before React mount
- String values in SQL need wrapping with `sf()` (adds single quotes)
- All data operations go through the `Database` class singleton

## TypeScript

Gradual migration in progress. New files should prefer `.ts`/`.tsx` when possible.

- Config: `tsconfig.json` at project root
- Strict mode: not yet enabled
- `@typescript-eslint` rules are relaxed (warn level)

## Build Output

- `out/` — electron-vite build artifacts (do not edit)
- `release/` — packaged installers
- Build command: `npx electron-vite build`
- Three bundles: main (`out/main/`), preload (`out/preload/`), renderer (`out/renderer/`)

## Internationalization (i18n)

### All User-Facing Strings Must Use i18n

Every user-visible string (UI labels, messages, dialog titles, error text, tooltips, placeholders) **must** use `t()` from `react-i18next`. No hardcoded Chinese or English strings in components.

```jsx
// CORRECT
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
<Button>{t('common.cancel')}</Button>
message.success(t('batch.moved', { count: ids.length }));

// WRONG — do not hardcode strings
<Button>取消</Button>
message.success(`已移动 ${ids.length} 个图标`);
```

### Translation Key Conventions

- Flat dot-separated namespace keys: `export.progress.css`, `editor.nameEmpty`
- Namespaces match component areas: `menu.*`, `nav.*`, `editor.*`, `batch.*`, `export.*`, `file.*`, `splash.*`, `group.*`, `toolbar.*`, `settings.*`, `common.*`, `import.*`, `emptyState.*`, `prefix.*`
- Interpolation uses `{{variable}}` syntax: `t('batch.moved', { count: 5 })`
- Shared strings use `common.*` namespace: `common.cancel`, `common.confirm`, `common.save`

### Adding New Strings

When adding a new feature or UI element:

1. Add the key + Chinese value to `src/locales/zh-CN.json`
2. Add the key + English value to `src/locales/en.json`
3. Use `t('namespace.key')` in the component

### Main Process Strings

Menu items and main process dialogs use `src/main/i18n.ts`:

```typescript
import i18n from './i18n';
const t = i18n.t.bind(i18n);
label: t('menu.file.save')
```

### Adding a New Language

See Contributing Translations section in README.md.

## Analytics

All user-facing actions must be tracked through the Analytics Gateway:

1. **Register the event** in `src/core/analytics/catalog.ts` with name, category, tier, and description
2. **Call `analytics.track()`** in the store action or component handler
3. **Choose the correct tier**: `basic` for anonymous counts (opt-out), `detailed` for feature usage (opt-in)

Rules:
- Never call GA4 or write to the analytics store directly — always go through `track()`
- Never include project content, file names, or SVG data in event params
- The `track()` function's TypeScript type ensures only registered events compile
- Local store recording is always on (user's own data); GA4 is gated by consent

## Core Operations Layer

All user-facing operations MUST be implemented in `src/core/operations/` first.

- Core operations receive `IoAdapter` as a parameter -- never import `fs`, `path`, `window`, or `electronAPI` directly
- Store actions are thin wrappers: call core operation -> update UI state
- Register operations in `src/core/registry.ts`
- Add corresponding CLI commands in `src/cli/commands/`
- Components must not import from `src/renderer/database/` -- go through operations or store

See `docs/MIGRATION.md` for the full migration process.
