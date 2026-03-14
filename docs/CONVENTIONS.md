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
app/components/MyComponent/
  index.jsx          # Component logic
  index.module.css   # Scoped styles
```

## State Management (Zustand)

Single store at `app/store/index.js`. Access via hook:

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
