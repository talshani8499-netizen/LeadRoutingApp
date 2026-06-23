// Small typed accessor for environment configuration so the rest of the app
// never reads process.env directly.

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const env = {
  provider: (process.env.PROVIDER ?? "simulator") as "simulator" | "twilio",
  platformCallerId: process.env.PLATFORM_CALLER_ID ?? "+15555550123",
  enableSimTicker: process.env.ENABLE_SIM_TICKER === "1",

  // Optional, opt-in security controls. All default to "off" so the local demo
  // keeps working with zero config; set them to harden a real deployment.
  // - dashboardPassword: when set, Basic-auth gates the dashboard + admin APIs.
  //   In production, auth is FAIL-CLOSED: if this is unset the gate denies
  //   protected routes (see src/middleware.ts) instead of silently allowing.
  // - leadWebhookSecret: when set, /api/webhook/lead requires this token.
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? "",
  leadWebhookSecret: process.env.LEAD_WEBHOOK_SECRET ?? "",

  // Number of trusted reverse proxies in front of the app. 0 = take the first
  // X-Forwarded-For entry (default; correct on platforms like Vercel that set a
  // trustworthy XFF). >0 = take the Nth-from-last hop, which resists clients
  // spoofing extra XFF entries when you control the proxy chain.
  trustedProxyDepth: num(process.env.TRUSTED_PROXY_DEPTH, 0),

  // Outbound-call abuse caps (toll-fraud defense), enforced before placing real
  // calls. Only applied when PROVIDER != simulator.
  callCaps: {
    globalPerMin: num(process.env.MAX_GLOBAL_CALLS_PER_MIN, 60),
    perDestinationPerHour: num(process.env.MAX_CALLS_PER_DEST_PER_HOUR, 5),
  },

  // Shared rate-limit store. When both are set, the limiter uses Upstash Redis
  // (correct across serverless instances); otherwise it falls back to in-memory.
  upstash: {
    url: process.env.UPSTASH_REDIS_REST_URL ?? "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    number: process.env.TWILIO_NUMBER ?? "",
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, ""),
  },
};

/**
 * Validate configuration at boot (called from src/instrumentation.ts).
 * Lenient in dev/test (warns) so the demo runs with zero config; strict in
 * production (throws) so a misconfigured deploy fails fast instead of booting
 * "healthy" and then 500ing on the first lead.
 */
export function validateEnv(): void {
  const problems: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set");

  if (env.provider === "twilio") {
    if (!env.twilio.accountSid) problems.push("TWILIO_ACCOUNT_SID is required when PROVIDER=twilio");
    if (!env.twilio.authToken) problems.push("TWILIO_AUTH_TOKEN is required when PROVIDER=twilio");
    if (!env.twilio.number) problems.push("TWILIO_NUMBER is required when PROVIDER=twilio");
    if (!env.twilio.publicBaseUrl) problems.push("PUBLIC_BASE_URL is required when PROVIDER=twilio");
  }

  if (isProd) {
    if (!env.dashboardPassword)
      problems.push("DASHBOARD_PASSWORD is required in production (dashboard/admin auth)");
    if (env.provider !== "simulator" && !env.leadWebhookSecret)
      problems.push("LEAD_WEBHOOK_SECRET is required in production when placing real calls");
  }

  if (problems.length === 0) return;
  const message = "Invalid environment configuration:\n - " + problems.join("\n - ");
  if (isProd) throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn("[env] " + message + "\n(non-production: continuing with defaults)");
}
