# Parallel Development Guide

How multiple agents (or developers) can work on Bobcorn simultaneously without conflicts.

## Module Ownership

| Module | Path | Lock Policy | Notes |
|--------|------|-------------|-------|
| store | `src/renderer/store/` | **Locked** | Single Zustand store; concurrent edits cause merge conflicts |
| database | `src/renderer/database/` | **Locked** | Schema changes affect every component that reads data |
| main process | `src/main/` | **Locked** | IPC channel changes ripple into preload + renderer |
| preload | `src/preload/` | **Locked** | Bridge API changes affect all renderer consumers |
| config | `src/renderer/config/` | **Locked** | Shared constants; concurrent edits break defaults |
| components | `src/renderer/components/` | **Free** | Each subfolder is independent; parallel edits OK |
| containers | `src/renderer/containers/` | Coordinate | Touches store + components; coordinate if changing props |
| utils | `src/renderer/utils/` | **Free** | Pure functions; parallel edits OK if different subfolders |
| tests | `test/` | **Free** | Add new files freely; editing shared helpers needs coordination |

## Lock Protocol

Before editing a **Locked** module, create a lock file:

```bash
# Acquire
echo "agent-name $(date -u +%Y-%m-%dT%H:%M:%SZ) store" > docs/locks/store.lock

# Release (after commit)
rm docs/locks/store.lock
```

Rules:
1. Check `docs/locks/` before starting work on a locked module.
2. If a lock exists, wait or coordinate with the holder.
3. Always release the lock in the same commit that finishes the work.
4. Lock files are **not** committed — add `docs/locks/` to `.gitignore`.

## Safe Parallel Combinations

These pairs can be developed simultaneously without coordination:

| Agent A | Agent B | Safe? |
|---------|---------|-------|
| `components/SideMenu/` | `components/SideEditor/` | Yes |
| `components/IconBlock/` | `utils/generators/` | Yes |
| `utils/svg/` | `utils/importer/` | Yes |
| `test/unit/` (new file) | `components/*` | Yes |
| Any component | `resources/` (images) | Yes |

## Requires Coordination

These combinations touch shared state and need sequential merging:

| Change | Why |
|--------|-----|
| Adding a store field + consuming component | Store is locked; component waits for store PR to merge |
| New IPC channel | Requires main → preload → renderer changes in order |
| Database schema change | Affects every component that calls `db.*` |
| Adding a new config constant | Other agents may read stale defaults |
| Changing `containers/MainContainer` props | Props flow to all child components |
