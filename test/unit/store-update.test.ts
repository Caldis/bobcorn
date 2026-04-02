import { describe, it, expect, beforeEach } from 'vitest';

describe('update state slice', () => {
  let store: any;

  beforeEach(async () => {
    const { create } = await import('zustand');
    store = create((set: any, get: any) => ({
      updateStatus: 'idle' as 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error',
      updateVersion: null as string | null,
      updateProgress: 0,
      updateError: null as string | null,
      setUpdateStatus: (status: string, version?: string) => {
        set({
          updateStatus: status,
          ...(version !== undefined ? { updateVersion: version } : {}),
          ...(status === 'idle' ? { updateVersion: null, updateProgress: 0, updateError: null } : {}),
        });
      },
      setUpdateProgress: (percent: number) => set({ updateProgress: percent }),
      setUpdateError: (error: string | null) => set({ updateError: error }),
    }));
  });

  it('starts with idle status', () => {
    const s = store.getState();
    expect(s.updateStatus).toBe('idle');
    expect(s.updateVersion).toBeNull();
    expect(s.updateProgress).toBe(0);
    expect(s.updateError).toBeNull();
  });

  it('setUpdateStatus("checking") transitions to checking', () => {
    store.getState().setUpdateStatus('checking');
    expect(store.getState().updateStatus).toBe('checking');
  });

  it('setUpdateStatus("available", "1.8.0") stores version', () => {
    store.getState().setUpdateStatus('available', '1.8.0');
    const s = store.getState();
    expect(s.updateStatus).toBe('available');
    expect(s.updateVersion).toBe('1.8.0');
  });

  it('setUpdateProgress updates percent', () => {
    store.getState().setUpdateStatus('downloading');
    store.getState().setUpdateProgress(42);
    expect(store.getState().updateProgress).toBe(42);
  });

  it('setUpdateStatus("downloaded") preserves version', () => {
    store.getState().setUpdateStatus('available', '1.8.0');
    store.getState().setUpdateStatus('downloaded');
    expect(store.getState().updateStatus).toBe('downloaded');
    expect(store.getState().updateVersion).toBe('1.8.0');
  });

  it('setUpdateError stores error message', () => {
    store.getState().setUpdateError('Network error');
    expect(store.getState().updateError).toBe('Network error');
  });

  it('setUpdateStatus("idle") resets all update state', () => {
    store.getState().setUpdateStatus('available', '1.8.0');
    store.getState().setUpdateProgress(50);
    store.getState().setUpdateError('some error');
    store.getState().setUpdateStatus('idle');
    const s = store.getState();
    expect(s.updateStatus).toBe('idle');
    expect(s.updateVersion).toBeNull();
    expect(s.updateProgress).toBe(0);
    expect(s.updateError).toBeNull();
  });
});
