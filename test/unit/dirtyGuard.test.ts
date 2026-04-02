import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the store
const mockGetState = vi.fn();
vi.mock('../../src/renderer/store', () => ({
  default: { getState: () => mockGetState() },
}));

// Mock confirm dialog
const mockConfirm = vi.fn();
vi.mock('../../src/renderer/components/ui/dialog', () => ({
  confirm: (opts: any) => mockConfirm(opts),
}));

// Mock i18n
vi.mock('../../src/renderer/i18n', () => ({
  default: { t: (key: string) => key },
}));

const { guardDirtyState } = await import('../../src/renderer/utils/dirtyGuard');

describe('guardDirtyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true immediately when not dirty', async () => {
    mockGetState.mockReturnValue({ isDirty: false });
    const result = await guardDirtyState({ saveHandler: vi.fn() });
    expect(result).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('shows confirm dialog when dirty', async () => {
    mockGetState.mockReturnValue({ isDirty: true });
    mockConfirm.mockImplementation((opts: any) => { opts.onOk(); });
    const saveHandler = vi.fn().mockResolvedValue(undefined);
    const result = await guardDirtyState({ saveHandler });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(saveHandler).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('returns false when user cancels', async () => {
    mockGetState.mockReturnValue({ isDirty: true });
    mockConfirm.mockImplementation((opts: any) => { opts.onCancel(); });
    const result = await guardDirtyState({ saveHandler: vi.fn() });
    expect(result).toBe(false);
  });

  it('returns false when save throws', async () => {
    mockGetState.mockReturnValue({ isDirty: true });
    mockConfirm.mockImplementation((opts: any) => { opts.onOk(); });
    const saveHandler = vi.fn().mockRejectedValue(new Error('save failed'));
    const result = await guardDirtyState({ saveHandler });
    expect(result).toBe(false);
  });
});
