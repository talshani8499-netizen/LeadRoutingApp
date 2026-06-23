import { NextResponse } from "next/server";
import { runSimTick } from "@/lib/telephony/tick";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Advances the simulator. Called by the dashboard's poll (so watching the
// dashboard drives the simulation forward) and optionally by an in-process
// ticker. Idempotent — safe to call as often as you like.
//
// No-op outside simulator mode: with a real provider (Twilio) call state is
// driven by signed provider webhooks, so this endpoint must not be a usable
// state-driver in production.
async function handle() {
  if (env.provider !== "simulator") {
    return NextResponse.json({ ok: true, skipped: "not-simulator" });
  }
  const result = await runSimTick();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST() {
  return handle();
}

export async function GET() {
  return handle();
}
