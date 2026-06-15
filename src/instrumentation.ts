// Optional in-process simulator ticker. When ENABLE_SIM_TICKER=1, this advances
// the simulator once a second so the call flow progresses even when nobody is
// watching the dashboard. Single-container only — do not enable behind a
// multi-instance/serverless deployment. When disabled (the default), the
// simulation advances on dashboard polls instead.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_SIM_TICKER !== "1") return;
  if (process.env.PROVIDER && process.env.PROVIDER !== "simulator") return;

  const { runSimTick } = await import("@/lib/telephony/tick");

  const globalForTicker = globalThis as unknown as { simTicker?: NodeJS.Timeout };
  if (globalForTicker.simTicker) return; // avoid duplicate timers on reload

  globalForTicker.simTicker = setInterval(() => {
    runSimTick().catch((err) => console.error("[sim-ticker]", err));
  }, 1000);

  console.log("[sim-ticker] enabled (1s interval)");
}
