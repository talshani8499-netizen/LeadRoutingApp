import { NextResponse } from "next/server";
import { runSimTick } from "@/lib/telephony/tick";

export const dynamic = "force-dynamic";

// Advances the simulator. Called by the dashboard's poll (so watching the
// dashboard drives the simulation forward) and optionally by an in-process
// ticker. Idempotent — safe to call as often as you like.
async function handle() {
  const result = await runSimTick();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST() {
  return handle();
}

export async function GET() {
  return handle();
}
