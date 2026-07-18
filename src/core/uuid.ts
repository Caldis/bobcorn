/**
 * Environment-agnostic UUID v4 generator.
 *
 * Prefers the runtime's own crypto.randomUUID (available on globalThis in
 * Node 18+, browsers, and Electron renderer). Falls back to a Math.random
 * based v4 implementation (same algorithm as
 * src/renderer/utils/tools#generateUUID) when the Web Crypto API is absent.
 *
 * Deliberately imports NO Node builtins ('crypto' etc.) so this module — and
 * everything that depends on it, like ProjectDb — stays safe to import from
 * the renderer. Guarded by test/unit/core-boundary-guard.test.js.
 */
export function generateUUID(): string {
  const native = (globalThis as any).crypto?.randomUUID?.();
  if (native) return native;

  // Math.random fallback (UUID v4 shape)
  let d = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = ((d + Math.random() * 16) % 16) | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x7) | 0x8).toString(16);
  });
}
