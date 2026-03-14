# Troubleshooting

## Build & Launch

### `electron-vite build` fails with module resolution error

**Cause:** Wrong Node version.
**Fix:**
```bash
FNM="/c/Users/mail/AppData/Local/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe"
eval "$("$FNM" env --shell bash)" && "$FNM" use 18
```

### App shows white/blank screen on launch

**Cause:** Stale Electron process holding the port.
**Fix:**
```bash
taskkill /f /im electron.exe 2>/dev/null
npx electron-vite build && npx electron-vite preview
```

### `Cannot find module 'xxx'` in renderer

**Cause:** Node.js module used directly in renderer (contextIsolation blocks this).
**Fix:** Access Node APIs only through `window.electronAPI.*` (defined in `preload.js`).

### `import.meta.env` undefined in tests

**Cause:** Vitest runs in Node environment, not Vite's dev server.
**Fix:** The database module has a fallback: `import.meta.env?.DEV ?? false`. Follow the same pattern in new code.

## Runtime Errors

### `db is not initialized` or SQL errors on startup

**Cause:** React rendered before sql.js finished loading.
**Fix:** Ensure `bootstrap.jsx` awaits `dbReady` before calling `createRoot().render()`.

### SVG icons not displaying / XSS warning

**Cause:** Raw SVG injected without sanitization.
**Fix:** Always use `sanitizeSVG()` from `app/utils/sanitize.js` before `dangerouslySetInnerHTML`.

### `window.electronAPI is undefined`

**Cause:** Running outside Electron (e.g., in a browser), or preload script failed to load.
**Fix:** Check `electron.vite.config.js` preload entry points to `app/preload.js`.

## Testing

### Acceptance tests fail: "Cannot find Electron"

**Cause:** `out/` directory missing or stale.
**Fix:**
```bash
npx electron-vite build && node test/e2e/acceptance.js
```

### Vitest: `ReferenceError: describe is not defined`

**Cause:** Vitest globals not enabled.
**Fix:** Verify `vitest.config.js` has `globals: true`.

### Playwright timeout on `firstWindow()`

**Cause:** Electron crashed silently during startup.
**Fix:** Run `npx electron-vite preview` manually first to confirm the app starts. Check for missing native modules.

## Packaging

### `electron-builder` fails on Windows

**Cause:** Missing Visual C++ Build Tools or Python.
**Fix:** Install "Desktop development with C++" workload from Visual Studio Build Tools. Required by `ttf2woff2` native module.

### Package too large (>200MB)

**Cause:** `node_modules` not pruned, or `out/` contains debug artifacts.
**Fix:** Ensure `asar: true` in `package.json` build config. Check that `files` only includes `out/**/*`.

## Common Patterns

### Adding a new IPC channel

1. Add handler in `app/main.dev.js`: `ipcMain.handle('my-channel', async (event, args) => { ... })`
2. Expose in `app/preload.js`: `myMethod: (args) => ipcRenderer.invoke('my-channel', args)`
3. Call in renderer: `const result = await window.electronAPI.myMethod(args)`

### Adding a new Zustand action

Edit `app/store/index.js` — add the action inside the `create()` callback:
```js
myAction: (param) => set({ myState: param }),
```
