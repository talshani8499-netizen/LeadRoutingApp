import { NextRequest, NextResponse } from "next/server";
import { handleTelephonyEvent } from "@/lib/telephony/events";
import { mapTwilioStatus } from "@/lib/telephony/twilio";
import type { CallLeg } from "@/lib/telephony/types";

export const dynamic = "force-dynamic";

// Twilio statusCallback receiver. Twilio POSTs form-encoded leg state changes
// here; we normalize them and feed the same handleTelephonyEvent() the
// simulator uses. Inactive in v1 but fully wired.
export async function POST(req: NextRequest) {
  const form = await req.formData();
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
