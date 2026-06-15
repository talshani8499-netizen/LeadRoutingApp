import type { CallAttemptState, CallOutcome, LeadStatus } from "@/lib/enums";
import type { CallLeg, TelephonyStatus } from "@/lib/telephony/types";

// Pure transition logic for a single CallAttempt. No I/O lives here so it is
// trivially unit-testable; the orchestration (DB writes, follow-on calls)
// lives in telephony/events.ts.

export const TERMINAL_STATES: CallAttemptState[] = [
  "COMPLETED",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
  "AGENT_NO_ANSWER",
  "CANCELLED",
];

export function isTerminal(state: CallAttemptState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Compute the next state given the current state and an incoming leg event.
 * Returns null when the event is not valid for the current state (e.g. a
 * duplicate or out-of-order webhook), which the caller treats as a no-op.
 */
export function nextState(
  current: CallAttemptState,
  leg: CallLeg,
  status: TelephonyStatus,
): CallAttemptState | null {
  switch (current) {
    case "AGENT_RINGING":
      if (leg !== "agent") return null;
      if (status === "answered") return "AGENT_CONNECTED";
      if (status === "no-answer") return "AGENT_NO_ANSWER";
      if (status === "busy") return "AGENT_NO_ANSWER";
      if (status === "failed") return "AGENT_NO_ANSWER";
      return null; // initiated / ringing are informational

    case "LEAD_RINGING":
      if (leg !== "lead") return null;
      if (status === "answered") return "BRIDGED";
      if (status === "no-answer") return "NO_ANSWER";
      if (status === "busy") return "BUSY";
      if (status === "failed") return "FAILED";
      return null;

    case "BRIDGED":
      // Either leg hanging up ends the conversation successfully.
      if (status === "completed") return "COMPLETED";
      return null;

    default:
      // PENDING is advanced by placing the agent call (not by an event);
      // terminal states ignore further events.
      return null;
  }
}

/** Map a terminal attempt state to the call outcome we record. */
export function outcomeForState(state: CallAttemptState): CallOutcome | null {
  switch (state) {
    case "COMPLETED":
      return "CONNECTED";
    case "NO_ANSWER":
    case "AGENT_NO_ANSWER":
      return "NO_ANSWER";
    case "BUSY":
      return "BUSY";
    case "FAILED":
      return "FAILED";
    default:
      return null;
  }
}

/** Map a terminal *lead-facing* attempt state to the Lead.status it implies. */
export function leadStatusForState(state: CallAttemptState): LeadStatus | null {
  switch (state) {
    case "COMPLETED":
      return "CONNECTED";
    case "NO_ANSWER":
      return "NO_ANSWER";
    case "BUSY":
      return "BUSY";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "NO_AGENT_AVAILABLE";
    default:
      return null; // AGENT_NO_ANSWER does not finalize the lead (fallback continues)
  }
}

/** Human-friendly label for a state (used in activity log / UI). */
export function stateLabel(state: CallAttemptState): string {
  const map: Record<CallAttemptState, string> = {
    PENDING: "Pending",
    AGENT_RINGING: "Calling agent",
    AGENT_CONNECTED: "Agent connected",
    LEAD_RINGING: "Calling lead",
    BRIDGED: "In conversation",
    COMPLETED: "Connected",
    NO_ANSWER: "Lead no answer",
    BUSY: "Lead busy",
    FAILED: "Call failed",
    AGENT_NO_ANSWER: "Agent no answer",
    CANCELLED: "No agent available",
  };
  return map[state];
}
