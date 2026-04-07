# Group Icon Cleanup Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an icon is deleted or moved out of its group, automatically clean up any `groupData.groupIcon` reference pointing to it — using SQLite triggers at the database level.

**Architecture:** Two SQLite triggers on `iconData` (AFTER DELETE + AFTER UPDATE OF iconGroup) automatically NULL out `groupData.groupIcon` when the referenced icon disappears from the group. A one-time migration repairs existing orphaned references. The `groupIcon` column and triggers are added to the shared core schema so they work identically in GUI and CLI.

**Tech Stack:** SQLite triggers (sql.js), existing migration infrastructure in both `src/core/database/index.ts` and `src/renderer/database/index.ts`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/types.ts` | Modify | Add `groupIcon` to `GroupData` interface |
| `src/core/database/index.ts` | Modify | Add `groupIcon` column to `CREATE TABLE`, add triggers to `initSchema()`, add migration in `runMigrations()` |
| `src/renderer/database/index.ts` | Modify | Add triggers to `initNewProject()`, add migration in `initNewProjectFromData()`, remove lazy `ensureGroupIconColumn()` |
| `src/renderer/components/SideMenu/types.ts` | No change | Already has `groupIcon?: string` |
| `test/unit/database.test.js` | Modify | Add tests for trigger cleanup behavior |
| `test/unit/core-database.test.ts` | Modify | Add tests for core-side trigger + migration |

---

### Task 1: Add `groupIcon` to Core Shared Types

**Files:**
- Modify: `src/core/types.ts:31-39`

- [ ] **Step 1: Add `groupIcon` to `GroupData` interface**

```typescript
/** Group data as stored in the database */
export interface GroupData {
  id: string;
  groupName: string;
  groupOrder: number;
  groupColor?: string;
  groupDescription?: string;
  groupIcon?: string;
  createTime?: string;
  updateTime?: string;
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No new errors (existing ones may appear, but no new ones related to `groupIcon`)

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(core): add groupIcon to shared GroupData type"
```

---

### Task 2: Add Triggers + Migration to Core Database

**Files:**
- Modify: `src/core/database/index.ts:46-50` (trigger constants)
- Modify: `src/core/database/index.ts:130-148` (initSchema)
- Modify: `src/core/database/index.ts:156-159` (runMigrations)
- Modify: `src/core/database/index.ts:184-195` (migrateGroupColumns)
- Test: `test/unit/core-database.test.ts`

- [ ] **Step 1: Write the failing test — trigger cleans up groupIcon on icon delete**

Add to `test/unit/core-database.test.ts`:

```typescript
describe('groupIcon cleanup triggers', () => {
  test('deleting an icon NULLs groupIcon references', async () => {
    const io = createMemoryIo();
    const projectPath = 'test.icp';
    await createProject(io, projectPath, 'test');
    const db = await openProject(io, projectPath);

    try {
      // Create a group and an icon
      db.addGroup('testGroup', 'TestGroup');
      const groups = db.getGroups();
      const group = groups.find((g: any) => g.groupName === 'TestGroup')!;

      db.addIcon({
        id: 'icon-1',
        name: 'heart',
        group: group.id,
        code: 'E001',
        content: '<svg></svg>',
      });

      // Assign icon as group icon
      db.db.run(`UPDATE groupData SET groupIcon = 'icon-1' WHERE id = '${group.id}'`);

      // Verify assignment
      const before = db.db.exec(`SELECT groupIcon FROM groupData WHERE id = '${group.id}'`);
      expect(before[0].values[0][0]).toBe('icon-1');

      // Delete the icon
      db.deleteIcon('icon-1');

      // Trigger should have NULLed the reference
      const after = db.db.exec(`SELECT groupIcon FROM groupData WHERE id = '${group.id}'`);
      expect(after[0].values[0][0]).toBeNull();
    } finally {
      db.close();
    }
  });

  test('moving an icon to another group NULLs groupIcon in the source group', async () => {
    const io = createMemoryIo();
    const projectPath = 'test.icp';
    await createProject(io, projectPath, 'test');
    const db = await openProject(io, projectPath);

    try {
      // Create two groups
      db.addGroup('groupA', 'Group A');
      db.addGroup('groupB', 'Group B');
      const groups = db.getGroups();
      const groupA = groups.find((g: any) => g.groupName === 'Group A')!;
      const groupB = groups.find((g: any) => g.groupName === 'Group B')!;

      db.addIcon({
        id: 'icon-1',
        name: 'heart',
        group: groupA.id,
        code: 'E001',
        content: '<svg></svg>',
      });

      // Assign as groupA's icon
      db.db.run(`UPDATE groupData SET groupIcon = 'icon-1' WHERE id = '${groupA.id}'`);

      // Move icon to groupB
      db.moveIcon('icon-1', groupB.id);

      // groupA's groupIcon should be NULLed
      const afterA = db.db.exec(`SELECT groupIcon FROM groupData WHERE id = '${groupA.id}'`);
      expect(afterA[0].values[0][0]).toBeNull();
    } finally {
      db.close();
    }
  });

  test('moving an icon within the same group does NOT clear groupIcon', async () => {
    const io = createMemoryIo();
    const projectPath = 'test.icp';
    await createProject(io, projectPath, 'test');
    const db = await openProject(io, projectPath);

    try {
      db.addGroup('groupA', 'Group A');
      const groups = db.getGroups();
      const groupA = groups.find((g: any) => g.groupName === 'Group A')!;

      db.addIcon({
        id: 'icon-1',
        name: 'heart',
        group: groupA.id,
        code: 'E001',
        content: '<svg></svg>',
      });

      db.db.run(`UPDATE groupData SET groupIcon = 'icon-1' WHERE id = '${groupA.id}'`);

      // "Move" to the same group (no-op for trigger)
      db.moveIcon('icon-1', groupA.id);

      // Should still be set
      const after = db.db.exec(`SELECT groupIcon FROM groupData WHERE id = '${groupA.id}'`);
      expect(after[0].values[0][0]).toBe('icon-1');
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/core-database.test.ts -t "groupIcon cleanup"`
Expected: FAIL — `groupIcon` column doesn't exist yet in core, triggers not defined

- [ ] **Step 3: Add trigger constants and `groupIcon` to core schema**

In `src/core/database/index.ts`, add trigger constants near line 50:

```typescript
const TRIGGER_CLEANUP_GROUP_ICON_DELETE = 'cleanupGroupIconOnDelete';
const TRIGGER_CLEANUP_GROUP_ICON_MOVE = 'cleanupGroupIconOnMove';
```

In `initSchema()`, modify the GROUP table CREATE to include `groupIcon`:

```typescript
    // Group data table
    this.db.run(
      `CREATE TABLE ${TABLE_GROUP} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupDescription TEXT, groupIcon TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
```

After the existing group trigger, add the two cleanup triggers:

```typescript
    // Cleanup triggers: auto-NULL groupIcon when referenced icon is deleted or moved
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_DELETE} AFTER DELETE ON ${TABLE_ICON} FOR EACH ROW BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`
    );
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_MOVE} AFTER UPDATE OF iconGroup ON ${TABLE_ICON} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`
    );
```

- [ ] **Step 4: Add migration for existing databases**

In `migrateGroupColumns()`, add after the `groupDescription` migration:

```typescript
  private migrateGroupColumns(): void {
    try {
      const colNames = this.getColumnNames(TABLE_GROUP);
      if (colNames.length === 0) return;

      if (!colNames.includes('groupDescription')) {
        this.db.run(`ALTER TABLE ${TABLE_GROUP} ADD COLUMN groupDescription TEXT`);
      }
      if (!colNames.includes('groupIcon')) {
        this.db.run(`ALTER TABLE ${TABLE_GROUP} ADD COLUMN groupIcon TEXT`);
      }

      // Cleanup triggers (idempotent — CREATE TRIGGER IF NOT EXISTS not supported in SQLite,
      // so we drop-then-create to ensure the latest definition is active)
      this.db.run(`DROP TRIGGER IF EXISTS ${TRIGGER_CLEANUP_GROUP_ICON_DELETE}`);
      this.db.run(
        `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_DELETE} AFTER DELETE ON ${TABLE_ICON} FOR EACH ROW BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`
      );
      this.db.run(`DROP TRIGGER IF EXISTS ${TRIGGER_CLEANUP_GROUP_ICON_MOVE}`);
      this.db.run(
        `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_MOVE} AFTER UPDATE OF iconGroup ON ${TABLE_ICON} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`
      );

      // One-time repair: clean up any orphaned groupIcon references
      this.db.run(
        `UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon IS NOT NULL AND groupIcon NOT IN (SELECT id FROM ${TABLE_ICON})`
      );
    } catch (_) {
      // Column might already exist
    }
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/unit/core-database.test.ts -t "groupIcon cleanup"`
Expected: PASS — all 3 tests green

- [ ] **Step 6: Commit**

```bash
git add src/core/database/index.ts test/unit/core-database.test.ts
git commit -m "feat(core): add groupIcon cleanup triggers + migration"
```

---

### Task 3: Add Triggers + Migration to Renderer Database

**Files:**
- Modify: `src/renderer/database/index.ts:461-477` (initNewProject)
- Modify: `src/renderer/database/index.ts:483-504` (initNewProjectFromData + migrations)
- Modify: `src/renderer/database/index.ts:628-676` (setGroupInfo + ensureGroupIconColumn)
- Modify: `src/renderer/database/index.ts:65-74` (GroupData interface)
- Test: `test/unit/database.test.js`

- [ ] **Step 1: Write the failing test — renderer trigger cleans up groupIcon on icon delete**

Add to `test/unit/database.test.js`:

```javascript
describe('groupIcon cleanup triggers', () => {
  test('deleting an icon NULLs groupIcon references', () => {
    // Add group and icon
    let groupId;
    db.addGroup('TestGroup', (g) => { groupId = g.id; });
    const iconId = generateUUID();
    db.addIconRaw({
      id: sf(iconId),
      iconCode: sf('E001'),
      iconName: sf('heart'),
      iconGroup: sf(groupId),
      iconSize: 100,
      iconType: sf('svg'),
      iconContent: sf(svgContent('heart.svg')),
    });

    // Assign icon as group icon
    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = ${sf(iconId)} WHERE id = ${sf(groupId)}`);

    // Verify assignment
    const before = db.db.exec(`SELECT groupIcon FROM ${T_GROUP} WHERE id = ${sf(groupId)}`);
    expect(before[0].values[0][0]).toBe(iconId);

    // Delete the icon (hard delete, same as deleteIconWithVariants)
    db.db.run(`DELETE FROM ${T_ICON} WHERE id = ${sf(iconId)}`);

    // Trigger should have NULLed the reference
    const after = db.db.exec(`SELECT groupIcon FROM ${T_GROUP} WHERE id = ${sf(groupId)}`);
    expect(after[0].values[0][0]).toBeNull();
  });

  test('moving icon to different group NULLs groupIcon in source group', () => {
    let groupAId, groupBId;
    db.addGroup('GroupA', (g) => { groupAId = g.id; });
    db.addGroup('GroupB', (g) => { groupBId = g.id; });

    const iconId = generateUUID();
    db.addIconRaw({
      id: sf(iconId),
      iconCode: sf('E001'),
      iconName: sf('heart'),
      iconGroup: sf(groupAId),
      iconSize: 100,
      iconType: sf('svg'),
      iconContent: sf(svgContent('heart.svg')),
    });

    // Assign as groupA's icon
    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = ${sf(iconId)} WHERE id = ${sf(groupAId)}`);

    // Move icon to groupB
    db.db.run(`UPDATE ${T_ICON} SET iconGroup = ${sf(groupBId)} WHERE id = ${sf(iconId)}`);

    // groupA's groupIcon should be NULLed
    const afterA = db.db.exec(`SELECT groupIcon FROM ${T_GROUP} WHERE id = ${sf(groupAId)}`);
    expect(afterA[0].values[0][0]).toBeNull();
  });

  test('moving icon within same group keeps groupIcon', () => {
    let groupId;
    db.addGroup('GroupA', (g) => { groupId = g.id; });

    const iconId = generateUUID();
    db.addIconRaw({
      id: sf(iconId),
      iconCode: sf('E001'),
      iconName: sf('heart'),
      iconGroup: sf(groupId),
      iconSize: 100,
      iconType: sf('svg'),
      iconContent: sf(svgContent('heart.svg')),
    });

    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = ${sf(iconId)} WHERE id = ${sf(groupId)}`);

    // "Move" to same group — trigger WHEN clause should skip
    db.db.run(`UPDATE ${T_ICON} SET iconGroup = ${sf(groupId)} WHERE id = ${sf(iconId)}`);

    const after = db.db.exec(`SELECT groupIcon FROM ${T_GROUP} WHERE id = ${sf(groupId)}`);
    expect(after[0].values[0][0]).toBe(iconId);
  });

  test('migration repairs orphaned groupIcon references', () => {
    // Manually insert a groupIcon pointing to a non-existent icon
    let groupId;
    db.addGroup('Orphaned', (g) => { groupId = g.id; });
    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = 'ghost-icon-id' WHERE id = ${sf(groupId)}`);

    // Run the repair migration
    db.migrateGroupIconCleanup();

    // Should be NULLed
    const after = db.db.exec(`SELECT groupIcon FROM ${T_GROUP} WHERE id = ${sf(groupId)}`);
    expect(after[0].values[0][0]).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/database.test.js -t "groupIcon cleanup"`
Expected: FAIL — no `groupIcon` column, no triggers, no `migrateGroupIconCleanup` method

- [ ] **Step 3: Add `groupIcon` to renderer `GroupData` interface**

In `src/renderer/database/index.ts`, add `groupIcon` to the interface at line ~66:

```typescript
/** Group data as stored in the database */
export interface GroupData {
  id: string;
  groupName: string;
  groupOrder: number;
  groupColor?: string;
  groupDescription?: string;
  groupIcon?: string;
  createTime?: string;
  updateTime?: string;
}
```

- [ ] **Step 4: Add `groupIcon` column + triggers to `initNewProject()`**

In `src/renderer/database/index.ts`, modify the CREATE TABLE for `groupData` at line ~462:

```typescript
    this.db!.run(
      `CREATE TABLE ${groupData} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupDescription TEXT, groupIcon TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
```

After the existing `groupDataTimeRenewTrigger`, add:

```typescript
    // Cleanup triggers: auto-NULL groupIcon when referenced icon is deleted or moved out
    this.db!.run(
      `CREATE TRIGGER cleanupGroupIconOnDelete AFTER DELETE ON ${iconData} FOR EACH ROW BEGIN UPDATE ${groupData} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`
    );
    this.db!.run(
      `CREATE TRIGGER cleanupGroupIconOnMove AFTER UPDATE OF iconGroup ON ${iconData} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${groupData} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`
    );
```

- [ ] **Step 5: Add migration for existing databases**

Replace the `ensureGroupIconColumn` method with a more complete migration:

```typescript
  private ensureGroupIconColumn = (): void => {
    try {
      const cols = this.db!.exec(`PRAGMA table_info(${groupData})`);
      const has = cols.length > 0 && cols[0].values.some((row: any) => row[1] === 'groupIcon');
      if (!has) {
        this.db!.run(`ALTER TABLE ${groupData} ADD COLUMN groupIcon TEXT`);
        dev && console.log('Lazy migration: added groupIcon column');
      }

      // Ensure cleanup triggers exist (drop + create for idempotency)
      this.db!.run(`DROP TRIGGER IF EXISTS cleanupGroupIconOnDelete`);
      this.db!.run(
        `CREATE TRIGGER cleanupGroupIconOnDelete AFTER DELETE ON ${iconData} FOR EACH ROW BEGIN UPDATE ${groupData} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`
      );
      this.db!.run(`DROP TRIGGER IF EXISTS cleanupGroupIconOnMove`);
      this.db!.run(
        `CREATE TRIGGER cleanupGroupIconOnMove AFTER UPDATE OF iconGroup ON ${iconData} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${groupData} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`
      );

      // One-time repair: clean up orphaned references
      this.db!.run(
        `UPDATE ${groupData} SET groupIcon = NULL WHERE groupIcon IS NOT NULL AND groupIcon NOT IN (SELECT id FROM ${iconData})`
      );
    } catch (_) {
      /* column already exists */
    }
  };
```

Also call this migration in `initNewProjectFromData` after `migrateVariantColumns()` at line ~484:

```typescript
  initNewProjectFromData = (data: ArrayLike<number>): void => {
    dev && console.log('initNewProjectFromFile');
    this.destroyDatabase();
    this.initDatabases(data);
    this.migrateVariantColumns();
    this.ensureGroupIconColumn();  // ← add this line
  };
```

- [ ] **Step 6: Expose `migrateGroupIconCleanup` for test access and update TestDatabase**

In `test/unit/database.test.js`, add to the `TestDatabase` class:

1. Update `initNewProject()` to include `groupIcon` column and triggers:

```javascript
  initNewProject(projectName) {
    // ... existing project + icon table creation unchanged ...

    this.db.run(
      `CREATE TABLE ${T_GROUP} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupDescription TEXT, groupIcon TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
    );
    this.db.run(
      `CREATE TRIGGER groupDataTimeRenewTrigger AFTER UPDATE ON ${T_GROUP} FOR EACH ROW BEGIN UPDATE ${T_GROUP} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
    );
    // Cleanup triggers
    this.db.run(
      `CREATE TRIGGER cleanupGroupIconOnDelete AFTER DELETE ON ${T_ICON} FOR EACH ROW BEGIN UPDATE ${T_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`,
    );
    this.db.run(
      `CREATE TRIGGER cleanupGroupIconOnMove AFTER UPDATE OF iconGroup ON ${T_ICON} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${T_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`,
    );

    // ... existing icon table creation unchanged ...
  }
```

2. Add the repair migration method:

```javascript
  migrateGroupIconCleanup() {
    // Ensure column exists
    const cols = this.db.exec(`PRAGMA table_info(${T_GROUP})`);
    const has = cols.length > 0 && cols[0].values.some((row) => row[1] === 'groupIcon');
    if (!has) {
      this.db.run(`ALTER TABLE ${T_GROUP} ADD COLUMN groupIcon TEXT`);
    }
    // Repair orphaned references
    this.db.run(
      `UPDATE ${T_GROUP} SET groupIcon = NULL WHERE groupIcon IS NOT NULL AND groupIcon NOT IN (SELECT id FROM ${T_ICON})`,
    );
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run test/unit/database.test.js -t "groupIcon cleanup"`
Expected: PASS — all 4 tests green

- [ ] **Step 8: Run the full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 9: Commit**

```bash
git add src/renderer/database/index.ts test/unit/database.test.js
git commit -m "feat(renderer): add groupIcon cleanup triggers + migration + repair"
```

---

### Task 4: Remove Lazy Call Pattern, Consolidate Migration

**Files:**
- Modify: `src/renderer/database/index.ts:628-646` (setGroupInfo)

The old code calls `this.ensureGroupIconColumn()` lazily inside `setGroupInfo()`. Now that the migration runs at project-open time, this lazy call is redundant for correctness, but must remain for HMR safety (dev mode may reload modules without re-running migrations).

- [ ] **Step 1: Verify `ensureGroupIconColumn` is called at project open**

Check that `initNewProjectFromData` (line ~483) now calls `this.ensureGroupIconColumn()`. Confirmed in Task 3 Step 5.

The lazy call in `setGroupInfo` can remain as a safety net — it's idempotent and only costs 1 PRAGMA query. No change needed.

- [ ] **Step 2: Verify `setGroupInfo` still works after migration changes**

Run: `npx vitest run test/unit/database.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit (skip if no changes)**

No code changes in this task — just verification.

---

### Task 5: Manual Smoke Test

- [ ] **Step 1: Start dev mode**

```bash
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Where-Object { \$_.CommandLine -like '*bobcorn*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"
npx electron-vite dev
```

- [ ] **Step 2: Test delete cleanup**

1. Open a project with groups
2. Edit a group → pick an icon as group icon → save
3. Verify the icon appears in the sidebar group list
4. Delete that icon
5. Verify the group icon disappears from the sidebar (no broken display, no error)

- [ ] **Step 3: Test move cleanup**

1. Edit a group → pick an icon as group icon → save
2. Move that icon to a different group (via right-click or batch panel)
3. Verify the source group's icon disappears from the sidebar

- [ ] **Step 4: Test old project migration**

1. Open an old `.icp` file that may have orphaned groupIcon references
2. Verify no errors on load
3. Verify sidebar displays cleanly (no broken icon previews)

---

### Task 6: Run Full Acceptance Suite

- [ ] **Step 1: Kill dev process**

```bash
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Where-Object { \$_.CommandLine -like '*bobcorn*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"
```

- [ ] **Step 2: Build**

Run: `npx electron-vite build`
Expected: Build succeeds

- [ ] **Step 3: Unit tests**

Run: `npx vitest run`
Expected: All tests pass (including new groupIcon cleanup tests)

- [ ] **Step 4: E2E acceptance**

Run: `node test/e2e/acceptance.js`
Expected: All checks pass

- [ ] **Step 5: Full E2E**

Run: `node test/e2e/full-e2e.js`
Expected: All steps pass

- [ ] **Step 6: Commit final state if any fixups were needed**

```bash
git add -A
git commit -m "test: verify groupIcon cleanup triggers pass full suite"
```
