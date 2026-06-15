import { env } from "@/lib/env";
import type { TelephonyProvider } from "./types";
import { SimulatorProvider } from "./simulator";
import { TwilioProvider } from "./twilio";

// Cache the provider instance across requests within a single runtime.
const globalForProvider = globalThis as unknown as {
  telephonyProvider?: TelephonyProvider;
};

/** Resolve the configured telephony provider (defaults to the simulator). */
export function getProvider(): TelephonyProvider {
  if (globalForProvider.telephonyProvider) {
    return globalForProvider.telephonyProvider;
  }
  const provider: TelephonyProvider =
    env.provider === "twilio" ? new TwilioProvider() : new SimulatorProvider();
  globalForProvider.telephonyProvider = provider;
  return provider;
}

export type { TelephonyProvider } from "./types";
