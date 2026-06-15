// Minimal in-memory fixed-window rate limiter. Suitable for a single-container
// MVP to blunt abuse of the public lead webhook (spam, toll-fraud amplification
// when Twilio is enabled). For a multi-instance deployment, swap the store for
// Redis or a provider-level limiter.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterSec: 0 };
}

// Opportunistically evict expired windows so the map doesn't grow unbounded.
export function sweepRateLimitBuckets(): void {
  const now = Date.now();
  for (const [k, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(k);
  }
}
