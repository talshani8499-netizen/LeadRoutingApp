import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTelephonyConfig } from "@/lib/telephony/config";
import { telephonyConfigSchema } from "@/lib/validation";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

// Returns the editable config for the Settings -> Telephony page. The auth token
// is NEVER returned; instead `hasAuthToken` indicates whether one is stored.
export async function GET() {
  const cfg = await getTelephonyConfig();
  return NextResponse.json({
    provider: cfg.provider,
    twilioAccountSid: cfg.twilio.accountSid || "",
    twilioNumber: cfg.twilio.number || "",
    platformCallerId: cfg.platformCallerId || "",
    publicBaseUrl: cfg.twilio.publicBaseUrl || "",
    hasAuthToken: Boolean(cfg.twilio.authToken),
    ready: cfg.ready,
    source: cfg.source,
  });
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = telephonyConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const d = parsed.data;

  const base = {
    provider: d.provider,
    twilioAccountSid: d.twilioAccountSid ?? null,
    twilioNumber: d.twilioNumber ?? null,
    platformCallerId: d.platformCallerId ?? null,
    publicBaseUrl: d.publicBaseUrl ?? null,
  };
  // Only overwrite the secret when a new one is supplied — blank keeps the old.
  const update = d.twilioAuthToken ? { ...base, twilioAuthToken: d.twilioAuthToken } : base;
  const create = { id: "default", twilioAuthToken: d.twilioAuthToken ?? null, ...base };

  try {
    await prisma.telephonyConfig.upsert({ where: { id: "default" }, update, create });
    const cfg = await getTelephonyConfig();
    return NextResponse.json({ ok: true, ready: cfg.ready, provider: cfg.provider });
  } catch (err) {
    return apiError("telephony.config.save_failed", err);
  }
}
