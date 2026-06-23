import { NextRequest, NextResponse } from "next/server";
import { conferenceTwiML, isValidTwilioSignature } from "@/lib/telephony/twilio";
import { getTelephonyConfig } from "@/lib/telephony/config";

export const dynamic = "force-dynamic";

// Returns the TwiML that drops a call leg into the shared per-attempt
// conference room. Twilio fetches this URL when each leg is answered.
// Verifies X-Twilio-Signature in Twilio mode so the call topology isn't
// served to unauthenticated callers.
export async function POST(req: NextRequest) {
  const cfg = await getTelephonyConfig();
  if (cfg.provider === "twilio") {
    const form = await req.formData().catch(() => new FormData());
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = String(v);
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const url = `${cfg.twilio.publicBaseUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
    const valid = await isValidTwilioSignature(cfg.twilio.authToken, signature, url, params);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }
  }

  const attemptId = req.nextUrl.searchParams.get("attemptId") ?? "unknown";
  const xml = conferenceTwiML(`room-${attemptId}`);
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
