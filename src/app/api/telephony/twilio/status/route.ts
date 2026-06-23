import { NextRequest, NextResponse } from "next/server";
import { handleTelephonyEvent } from "@/lib/telephony/events";
import { isValidTwilioSignature, mapTwilioStatus } from "@/lib/telephony/twilio";
import type { CallLeg } from "@/lib/telephony/types";
import { getTelephonyConfig } from "@/lib/telephony/config";

export const dynamic = "force-dynamic";

// Twilio statusCallback receiver. Twilio POSTs form-encoded leg state changes
// here; we normalize them and feed the same handleTelephonyEvent() the
// simulator uses. Verifies X-Twilio-Signature so forged/replayed callbacks
// cannot drive the call state machine.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // Verify the signature in Twilio mode. The signed URL is the public callback
  // URL Twilio actually requested (PUBLIC_BASE_URL + path + query).
  const cfg = await getTelephonyConfig();
  if (cfg.provider === "twilio") {
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const url = `${cfg.twilio.publicBaseUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
    const valid = await isValidTwilioSignature(cfg.twilio.authToken, signature, url, params);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }
  }

  const attemptId =
    req.nextUrl.searchParams.get("attemptId") ?? String(form.get("attemptId") ?? "");
  const leg = (req.nextUrl.searchParams.get("leg") ?? "agent") as CallLeg;
  const callSid = String(form.get("CallSid") ?? "");
  const callStatus = String(form.get("CallStatus") ?? "");

  if (attemptId && callStatus) {
    await handleTelephonyEvent({
      attemptId,
      providerCallSid: callSid,
      leg,
      status: mapTwilioStatus(callStatus),
    });
  }

  return NextResponse.json({ ok: true });
}
