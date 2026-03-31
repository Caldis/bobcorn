import { describe, it, expect, beforeEach } from 'vitest';

describe('dirty state tracking', () => {
  let store: any;

  beforeEach(async () => {
    const { create } = await import('zustand');
    store = create((set: any, get: any) => ({
      isDirty: false,
      currentFilePath: null as string | null,
      markDirty: () => { if (!get().isDirty) set({ isDirty: true }); },
      markClean: () => { if (get().isDirty) set({ isDirty: false }); },
      setCurrentFilePath: (path: string | null) => set({ currentFilePath: path }),
    }));
  });

  it('starts clean', () => {
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().currentFilePath).toBeNull();
  });

  it('markDirty sets isDirty to true', () => {
    store.getState().markDirty();
    expect(store.getState().isDirty).toBe(true);
  });

  it('markDirty is idempotent (no extra state updates)', () => {
    let updateCount = 0;
    store.subscribe(() => { updateCount++; });
    store.getState().markDirty();
    store.getState().markDirty();
    store.getState().markDirty();
    expect(updateCount).toBe(1);
  });

  it('markClean resets isDirty', () => {
    store.getState().markDirty();
    store.getState().markClean();
    expect(store.getState().isDirty).toBe(false);
  });

  it('markClean is idempotent (no extra state updates)', () => {
    store.getState().markDirty();
    let updateCount = 0;
    store.subscribe(() => { updateCount++; });
    store.getState().markClean();
    store.getState().markClean();
    store.getState().markClean();
    expect(updateCount).toBe(1);
  });

  it('setCurrentFilePath updates path', () => {
    store.getState().setCurrentFilePath('/tmp/test.icp');
    expect(store.getState().currentFilePath).toBe('/tmp/test.icp');
  });

  it('setCurrentFilePath(null) clears path', () => {
    store.getState().setCurrentFilePath('/tmp/test.icp');
    store.getState().setCurrentFilePath(null);
    expect(store.getState().currentFilePath).toBeNull();
  });
});
