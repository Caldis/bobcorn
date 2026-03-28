# Dependency Map

Module-level dependency graph for Bobcorn's renderer process.

## Store → Component Dependencies

Components that read from the Zustand store (`useAppStore`):

| Component | Store Fields Read | Store Actions Used |
|-----------|------------------|--------------------|
| `MainContainer` | `splashScreenVisible`, `selectedGroup`, `selectedIcon`, `selectedSource`, `sideMenuVisible`, `sideEditorVisible` | `selectGroup`, `selectIcon`, `selectSource`, `toggleDarkMode` |
| `SplashScreen` | — | `showSplashScreen`, `selectGroup`, `syncLeft` |
| `SideMenu` | `groupData` | `syncLeft`, `selectGroup` |
| `IconGridLocal` | `groupData` | `syncLeft`, `selectGroup` |
| `SideEditor` | `groupData` | `syncLeft`, `selectIcon` |

## Database → Component Dependencies

Components that import `db` directly:

| Component | Database Methods Used |
|-----------|---------------------|
| `SideMenu` | Group CRUD, project import/export, icon import |
| `IconGridLocal` | Icon listing, icon import, config queries |
| `IconInfoBar` | Icon count queries |
| `SideEditor` | Icon data read/write, group data queries |
| `store/index.js` | `db.getGroupList()` (via `syncLeft` action) |

## Module Dependency Graph

```
bootstrap.jsx
 └─► MainContainer
      ├─► TitleBar/button
      ├─► SplashScreen ──► store, config, utils/loaders, utils/importer
      ├─► SideMenu ──────► store, database, config, utils/*, enhance/input
      ├─► SideGrid
      │    ├─► IconGridLocal ► store, database, config, utils/tools, IconBlock, IconToolbar
      │    └─► IconInfoBar ──► database
      └─► SideEditor ───────► store, database, utils/tools, enhance/input

store/index.js ──► database, config
database/index.js ──► utils/svg, utils/tools, config
```

## Change Impact Analysis

| If you change… | You must verify… |
|----------------|-----------------|
| Store field name | All components in "Store Fields Read" column above |
| Store action signature | All components in "Store Actions Used" column above |
| `db.getGroupList()` return shape | `store/index.js` (`syncLeft`), then all `groupData` consumers |
| `db.getIconData()` return shape | `SideEditor`, `IconGridLocal`, `SideMenu` |
| `db.getIconListFromGroup()` | `IconGridLocal`, `SideMenu` (font export) |
| `config` constants | `SideMenu`, `IconGridLocal`, `database/index.js` |
| `utils/sanitize.js` | `IconBlock` (renders SVG) |
| `utils/tools` exports | `MainContainer`, `SideEditor`, `IconGridLocal`, `database` |
| `utils/loaders` | `SplashScreen`, `SideMenu` |
| `utils/importer` | `SplashScreen`, `SideMenu` |
| `utils/generators/*` | `SideMenu` (export flow) |
| `preload` API surface | Every component using `window.electronAPI.*` |
