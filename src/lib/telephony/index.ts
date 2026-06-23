import type { TelephonyProvider } from "./types";
import { SimulatorProvider } from "./simulator";
import { TwilioProvider } from "./twilio";
import { getTelephonyConfig, type EffectiveTelephony } from "./config";

/**
 * Build the active telephony provider from the effective config (DB over env).
 * Constructed per call — config can change at runtime via the Settings UI, and
 * construction is cheap. Returns the resolved config too so callers can read
 * the platform caller ID without a second DB round-trip.
 */
export async function getTelephony(): Promise<{
  provider: TelephonyProvider;
  config: EffectiveTelephony;
}> {
  const config = await getTelephonyConfig();
  const provider: TelephonyProvider =
    config.provider === "twilio" ? new TwilioProvider(config.twilio) : new SimulatorProvider();
  return { provider, config };
}

/** Convenience: resolve just the active provider. */
export async function getProvider(): Promise<TelephonyProvider> {
  return (await getTelephony()).provider;
}

export type { TelephonyProvider } from "./types";
export { getTelephonyConfig };
