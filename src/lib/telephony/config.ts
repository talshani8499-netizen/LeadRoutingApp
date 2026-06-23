import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

// The platform's effective telephony configuration. The persisted DB row
// (Settings -> Telephony) takes precedence over env defaults, so the number can
// be connected self-serve in the UI without a redeploy. The auth token lives
// here for server-side use only and is never returned to the browser.
export interface TwilioCreds {
  accountSid: string;
  authToken: string;
  number: string;
  publicBaseUrl: string;
}

export interface EffectiveTelephony {
  provider: "simulator" | "twilio";
  platformCallerId: string;
  twilio: TwilioCreds;
  /** True when the active provider is fully configured and usable. */
  ready: boolean;
  /** Where the config came from, for display. */
  source: "db" | "env";
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * Resolve the effective telephony config: persisted DB row merged over env
 * defaults. Safe if the table doesn't exist yet (falls back to env).
 */
export async function getTelephonyConfig(): Promise<EffectiveTelephony> {
  let row: Awaited<ReturnType<typeof prisma.telephonyConfig.findUnique>> = null;
  try {
    row = await prisma.telephonyConfig.findUnique({ where: { id: "default" } });
  } catch {
    // Table may not exist in some environments — fall back to env.
    row = null;
  }

  const provider = ((row?.provider as "simulator" | "twilio") || env.provider) === "twilio"
    ? "twilio"
    : "simulator";

  const twilio: TwilioCreds = {
    accountSid: row?.twilioAccountSid || env.twilio.accountSid,
    authToken: row?.twilioAuthToken || env.twilio.authToken,
    number: row?.twilioNumber || env.twilio.number,
    publicBaseUrl: stripTrailingSlash(row?.publicBaseUrl || env.twilio.publicBaseUrl),
  };

  const platformCallerId = row?.platformCallerId || twilio.number || env.platformCallerId;

  const ready =
    provider === "simulator"
      ? true
      : Boolean(twilio.accountSid && twilio.authToken && twilio.number && twilio.publicBaseUrl);

  return { provider, platformCallerId, twilio, ready, source: row ? "db" : "env" };
}
