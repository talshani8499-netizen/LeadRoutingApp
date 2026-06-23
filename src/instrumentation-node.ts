// Node.js-only instrumentation, imported lazily from instrumentation.ts when
// NEXT_RUNTIME === "nodejs". Nothing here (nor its telephony/Twilio dependencies)
// is ever bundled into the Edge runtime.
//
// 1) Validate configuration at boot — warns in dev, throws in production so a
//    misconfigured deploy fails fast instead of 500ing on the first request.
// 2) Optionally start the in-process simulator ticker (single-container only;
//    never used on serverless or with PROVIDER=twilio).
import { validateEnv } from "@/lib/env";
import { runSimTick } from "@/lib/telephony/tick";

validateEnv();

const tickerEnabled =
  process.env.ENABLE_SIM_TICKER === "1" &&
  (!process.env.PROVIDER || process.env.PROVIDER === "simulator");

if (tickerEnabled) {
  const globalForTicker = globalThis as unknown as { simTicker?: NodeJS.Timeout };
  if (!globalForTicker.simTicker) {
    globalForTicker.simTicker = setInterval(() => {
      runSimTick().catch((err) => console.error("[sim-ticker]", err));
    }, 1000);
    // eslint-disable-next-line no-console
    console.log("[sim-ticker] enabled (1s interval)");
  }
}
