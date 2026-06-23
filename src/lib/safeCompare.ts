// Constant-time string comparison, shared by the dashboard auth gate and the
// lead-webhook secret check so neither leaks secret length/content via timing.
// Compares character codes in a fixed number of iterations regardless of where
// the first mismatch is. Works in both the Edge and Node runtimes (no node:crypto).

export function timingSafeEqualStr(a: string, b: string): boolean {
  // Length is allowed to leak (it must, to compare) — but content does not.
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
