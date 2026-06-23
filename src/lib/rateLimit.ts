// Fixed-window rate limiter for the public lead webhook (spam + toll-fraud
// amplification defense). Uses Upstash Redis when configured — correct across
// multiple serverless instances — and falls back to a bounded in-memory map for
// single-container / local use.

import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

// --- Upstash backend (shared across instances) ---------------------------------

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  redis = env.upstash.url && env.upstash.token
    ? new Redis({ url: env.upstash.url, token: env.upstash.token })
    : null;
  return redis;
}

async function rateLimitRedis(
  r: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  const count = await r.incr(k);
  if (count === 1) {
    await r.pexpire(k, windowMs);
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (count > limit) {
    let ttl = await r.pttl(k);
    if (ttl < 0) {
      // Heal a key that somehow lost its TTL so an IP can't be blocked forever.
      await r.pexpire(k, windowMs);
      ttl = windowMs;
    }
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)) };
  }
  return { ok: true, remaining: limit - count, retryAfterSec: 0 };
}

// --- In-memory backend (single process) ----------------------------------------

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
// Cap the map so a flood of distinct keys can't exhaust memory (DoS).
const MAX_BUCKETS = 50_000;

function rateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) sweepRateLimitBuckets();
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

// --- Public API ----------------------------------------------------------------

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const r = getRedis();
  if (r) {
    try {
      return await rateLimitRedis(r, key, limit, windowMs);
    } catch {
      // If Redis is unreachable, fail OPEN to the in-memory limiter rather than
      // dropping legitimate traffic; the in-memory bucket still blunts abuse.
      return rateLimitMemory(key, limit, windowMs);
    }
  }
  return rateLimitMemory(key, limit, windowMs);
}

/**
 * Resolve the client IP for rate-limiting. The left-most X-Forwarded-For entry
 * is client-spoofable when no trusted proxy strips it, so:
 *  - if TRUSTED_PROXY_DEPTH>0, take the Nth-from-last hop (the address your own
 *    proxy chain inserted), which a client cannot forge;
 *  - else prefer the platform-set X-Real-IP, then fall back to the first XFF.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const depth = env.trustedProxyDepth;
  if (depth > 0 && xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= depth) return parts[parts.length - depth];
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const first = xff?.split(",")[0]?.trim();
  return first || "unknown";
}
