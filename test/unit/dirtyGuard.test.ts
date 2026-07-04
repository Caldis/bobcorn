import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the store — isDirty is read twice (before dialog, and after save to
// confirm markClean actually happened), so back it with a mutable flag.
let dirty = true;
const mockGetState = vi.fn(() => ({ isDirty: dirty }));
vi.mock('../../src/renderer/store', () => ({
  default: { getState: () => mockGetState() },
}));

// Mock confirm dialog
const mockConfirm = vi.fn();
vi.mock('../../src/renderer/components/ui/dialog', () => ({
  confirm: (opts: any) => mockConfirm(opts),
}));

// Mock i18n — echo the key (with interpolated action when present) so button
// text can be asserted if needed.
vi.mock('../../src/renderer/i18n', () => ({
  default: { t: (key: string, opts?: any) => (opts?.action ? `${key}:${opts.action}` : key) },
}));

const { guardDirtyState } = await import('../../src/renderer/utils/dirtyGuard');

describe('guardDirtyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dirty = true;
  });

  it('returns true immediately when not dirty', async () => {
    dirty = false;
    const result = await guardDirtyState({ saveHandler: vi.fn(), action: 'Open' });
    expect(result).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('renders a three-way dialog (cancel / discard / save) when dirty', async () => {
    mockConfirm.mockImplementation(() => {
      /* leave the promise pending — we only inspect the options */
    });
    guardDirtyState({ saveHandler: vi.fn(), action: 'Open' });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const opts = mockConfirm.mock.calls[0][0];
    expect(opts.okText).toBe('dirtyGuard.saveAnd:Open'); // primary
    expect(opts.okType).toBe('primary');
    expect(opts.dangerText).toBe('dirtyGuard.discardAnd:Open'); // danger
    expect(opts.cancelText).toBe('common.cancel');
  });

  it('saves then continues when user picks "Save & X" and save succeeds', async () => {
    // save success == markClean flips isDirty to false
    const saveHandler = vi.fn().mockImplementation(async () => {
      dirty = false;
    });
    mockConfirm.mockImplementation((opts: any) => {
      opts.onOk();
    });
    const result = await guardDirtyState({ saveHandler, action: 'Open' });
    expect(saveHandler).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('stays in place when save resolves but project is still dirty (Save-As cancelled)', async () => {
    // saveHandler resolves without markClean (native dialog cancelled)
    const saveHandler = vi.fn().mockResolvedValue(undefined);
    mockConfirm.mockImplementation((opts: any) => {
      opts.onOk();
    });
    const result = await guardDirtyState({ saveHandler, action: 'Open' });
    expect(saveHandler).toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('returns false when save throws', async () => {
    const saveHandler = vi.fn().mockRejectedValue(new Error('save failed'));
    mockConfirm.mockImplementation((opts: any) => {
      opts.onOk();
    });
    const result = await guardDirtyState({ saveHandler, action: 'Open' });
    expect(result).toBe(false);
  });

  it('discards and continues without saving when user picks "X anyway"', async () => {
    const saveHandler = vi.fn();
    mockConfirm.mockImplementation((opts: any) => {
      opts.onDanger();
    });
    const result = await guardDirtyState({ saveHandler, action: 'Open' });
    expect(result).toBe(true);
    expect(saveHandler).not.toHaveBeenCalled();
  });

  it('returns false when user cancels', async () => {
    mockConfirm.mockImplementation((opts: any) => {
      opts.onCancel();
    });
    const result = await guardDirtyState({ saveHandler: vi.fn(), action: 'Open' });
    expect(result).toBe(false);
  });
});
