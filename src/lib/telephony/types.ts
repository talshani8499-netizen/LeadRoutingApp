// The telephony contract. Both the Simulator and the Twilio adapter implement
// the same TelephonyProvider interface so the routing/state-machine code is
// completely provider-agnostic.

export type CallLeg = "agent" | "lead";

// Normalized status vocabulary. Each adapter maps its native statuses onto
// these values before handing them to handleTelephonyEvent().
export type TelephonyStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "completed"
  | "busy"
  | "no-answer"
  | "failed";

export interface PlaceCallParams {
  attemptId: string; // our CallAttempt id — correlates async callbacks
  leg: CallLeg;
  to: string; // destination phone number
  from: string; // platform caller ID
}

export interface PlaceCallResult {
  providerCallSid: string; // Twilio CallSid, or a "sim-..." id
}

export interface BridgeParams {
  attemptId: string;
  agentCallSid: string;
  leadCallSid: string;
  conferenceName: string; // shared room name (Twilio conference)
}

// A normalized event describing a state change on one call leg. This is the
// single shape that flows into the state machine, regardless of provider.
export interface TelephonyEvent {
  attemptId: string;
  providerCallSid: string;
  leg: CallLeg;
  status: TelephonyStatus;
}

export interface TelephonyProvider {
  readonly name: "simulator" | "twilio";

  /** Step 5: dial the agent first (agent-first dialing). */
  callAgent(params: PlaceCallParams): Promise<PlaceCallResult>;

  /** Step 6: dial the lead (only after the agent has answered). */
  callLead(params: PlaceCallParams): Promise<PlaceCallResult>;

  /** Step 7: connect both live legs together. */
  bridge(params: BridgeParams): Promise<void>;

  /** Tear down a single leg / the attempt. */
  hangup(providerCallSid: string): Promise<void>;
}
