import { NextResponse } from "next/server";
import { getTelephonyConfig } from "@/lib/telephony/config";

export const dynamic = "force-dynamic";

// Lightweight status for the sidebar / dashboard. Never returns secrets.
export async function GET() {
  const cfg = await getTelephonyConfig();
  return NextResponse.json({
    provider: cfg.provider,
    ready: cfg.ready,
    number: cfg.twilio.number || null,
    source: cfg.source,
  });
}
