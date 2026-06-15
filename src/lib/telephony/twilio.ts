import { env } from "@/lib/env";
import type {
  BridgeParams,
  PlaceCallParams,
  PlaceCallResult,
  TelephonyProvider,
  TelephonyStatus,
} from "./types";

// Twilio adapter — wired but intentionally inactive in v1.
//
// This documents exactly how the real provider maps onto the same interface as
// the simulator. To enable it: install the `twilio` package, set PROVIDER=twilio
// plus the TWILIO_* env vars and PUBLIC_BASE_URL, and replace the
// NotImplementedError throws with the (commented) real calls below.
//
// === How agent-first call bridging works with Twilio ===
// 1. callAgent(): create an outbound call to the agent. Its TwiML
//    (PUBLIC_BASE_URL/api/telephony/twilio/voice?attemptId=..&leg=agent) joins a
//    per-attempt <Conference> room. statusCallback points at
//    /api/telephony/twilio/status so leg state changes (ringing/answered/
//    completed/busy/no-answer/failed) are POSTed back to us.
// 2. On the "answered" status for the agent leg, our state machine calls
//    callLead(): an outbound call to the lead whose TwiML joins the SAME
//    conference room — that is the bridge.
// 3. When either party hangs up, Twilio POSTs "completed" and we finalize.
//
// Mapping Twilio CallStatus -> our normalized TelephonyStatus:
//   queued/initiated -> "initiated", ringing -> "ringing",
//   in-progress/answered -> "answered", completed -> "completed",
//   busy -> "busy", no-answer -> "no-answer", failed/canceled -> "failed".

export function mapTwilioStatus(twilioStatus: string): TelephonyStatus {
  switch (twilioStatus) {
    case "queued":
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "answered":
      return "answered";
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no-answer";
    default:
      return "failed";
  }
}

/**
 * Validate a Twilio webhook request's X-Twilio-Signature.
 *
 * Twilio signs the full request URL concatenated with the POST params (sorted
 * by key, joined as key+value) using HMAC-SHA1 keyed by the account auth token,
 * base64-encoded. We recompute it and constant-time compare. Implemented with
 * Web Crypto so it works in any runtime without a node: import.
 */
export async function isValidTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!authToken || !signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

/** TwiML that drops a leg into the shared per-attempt conference room. */
export function conferenceTwiML(conferenceName: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    "  <Dial>",
    `    <Conference startConferenceOnEnter="true" endConferenceOnExit="true">${conferenceName}</Conference>`,
    "  </Dial>",
    "</Response>",
  ].join("\n");
}

class NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `TwilioProvider.${method} is not enabled. Set PROVIDER=twilio with valid ` +
        `TWILIO_* credentials and PUBLIC_BASE_URL, then wire the real twilio client ` +
        `(see src/lib/telephony/twilio.ts).`,
    );
    this.name = "NotImplementedError";
  }
}

export class TwilioProvider implements TelephonyProvider {
  readonly name = "twilio" as const;

  constructor() {
    if (!env.twilio.accountSid || !env.twilio.authToken || !env.twilio.number) {
      // Surfaced eagerly so misconfiguration fails fast and clearly.
      throw new Error(
        "Twilio provider selected but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_NUMBER are missing.",
      );
    }
  }

  async callAgent(_params: PlaceCallParams): Promise<PlaceCallResult> {
    // const client = twilio(env.twilio.accountSid, env.twilio.authToken);
    // const call = await client.calls.create({
    //   to: _params.to,
    //   from: env.twilio.number,
    //   url: `${env.twilio.publicBaseUrl}/api/telephony/twilio/voice?attemptId=${_params.attemptId}&leg=agent`,
    //   statusCallback: `${env.twilio.publicBaseUrl}/api/telephony/twilio/status?attemptId=${_params.attemptId}&leg=agent`,
    //   statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    // });
    // return { providerCallSid: call.sid };
    throw new NotImplementedError("callAgent");
  }

  async callLead(_params: PlaceCallParams): Promise<PlaceCallResult> {
    throw new NotImplementedError("callLead");
  }

  async bridge(_params: BridgeParams): Promise<void> {
    // With the conference approach the bridge is implicit: the lead's voice
    // TwiML joins the agent's conference room. Nothing extra to call here.
    throw new NotImplementedError("bridge");
  }

  async hangup(_providerCallSid: string): Promise<void> {
    // await client.calls(_providerCallSid).update({ status: "completed" });
    throw new NotImplementedError("hangup");
  }
}
