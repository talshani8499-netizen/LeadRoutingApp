import { env } from "@/lib/env";
import type {
  BridgeParams,
  PlaceCallParams,
  PlaceCallResult,
  TelephonyProvider,
  TelephonyStatus,
} from "./types";

// Twilio adapter — ACTIVE. Implements the same TelephonyProvider interface as
// the simulator, backed by real Twilio REST calls.
//
// To use it: install the `twilio` package, set PROVIDER=twilio plus the TWILIO_*
// env vars and PUBLIC_BASE_URL. callAgent/callLead place real outbound calls and
// hangup tears a leg down. The `twilio` SDK is loaded via a dynamic import inside
// getClient() so the simulator path never needs the package present.
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

// The twilio SDK has no first-party types we can rely on being installed in the
// simulator-only build, so the lazily-created client is typed loosely. Params
// and return values stay strongly typed against TelephonyProvider.
type TwilioClient = any;

export class TwilioProvider implements TelephonyProvider {
  readonly name = "twilio" as const;

  private client: TwilioClient | null = null;

  constructor() {
    if (!env.twilio.accountSid || !env.twilio.authToken || !env.twilio.number) {
      // Surfaced eagerly so misconfiguration fails fast and clearly.
      throw new Error(
        "Twilio provider selected but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_NUMBER are missing.",
      );
    }
  }

  /**
   * Lazily construct and memoize the Twilio client. The SDK is imported
   * dynamically so the `twilio` package is only required at runtime when this
   * provider is actually selected — the simulator path never loads it, which
   * also lets this module typecheck without the package being installed.
   */
  private async getClient(): Promise<TwilioClient> {
    if (this.client) return this.client;
    // @ts-ignore -- optional dependency; resolved at runtime only in twilio mode.
    const twilioLib = (await import("twilio")).default;
    this.client = twilioLib(env.twilio.accountSid, env.twilio.authToken);
    return this.client;
  }

  async callAgent(params: PlaceCallParams): Promise<PlaceCallResult> {
    return this.placeCall(params, "agent");
  }

  async callLead(params: PlaceCallParams): Promise<PlaceCallResult> {
    return this.placeCall(params, "lead");
  }

  async bridge(_params: BridgeParams): Promise<void> {
    // With the conference approach the bridge is implicit: the lead's voice
    // TwiML joins the agent's conference room (see conferenceTwiML). There is
    // nothing extra to call here, so this is intentionally a no-op.
  }

  async hangup(providerCallSid: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.calls(providerCallSid).update({ status: "completed" });
    } catch (err) {
      // Teardown must be idempotent: a leg that already ended (e.g. the other
      // party hung up) makes Twilio reject the update. Swallow those so callers
      // can always attempt cleanup without special-casing terminal states.
      console.error(`TwilioProvider.hangup(${providerCallSid}) ignored error:`, err);
    }
  }

  /** Shared implementation for the agent/lead legs — only the `leg` differs. */
  private async placeCall(
    params: PlaceCallParams,
    leg: "agent" | "lead",
  ): Promise<PlaceCallResult> {
    const client = await this.getClient();
    const attemptId = encodeURIComponent(params.attemptId);
    const base = env.twilio.publicBaseUrl;
    const call = await client.calls.create({
      to: params.to,
      from: params.from || env.twilio.number,
      url: `${base}/api/telephony/twilio/voice?attemptId=${attemptId}&leg=${leg}`,
      statusCallback: `${base}/api/telephony/twilio/status?attemptId=${attemptId}&leg=${leg}`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });
    return { providerCallSid: call.sid };
  }
}
