import { describe, it, expect } from "vitest";
import {
  CALL_ATTEMPT_STATE,
} from "@/lib/enums";
import {
  isTerminal,
  leadStatusForState,
  nextState,
  outcomeForState,
  TERMINAL_STATES,
} from "./stateMachine";

describe("nextState", () => {
  it("advances the happy path agent-first flow", () => {
    expect(nextState("AGENT_RINGING", "agent", "answered")).toBe("AGENT_CONNECTED");
    expect(nextState("LEAD_RINGING", "lead", "answered")).toBe("BRIDGED");
    expect(nextState("BRIDGED", "lead", "completed")).toBe("COMPLETED");
  });

  it("routes agent failures to fallback", () => {
    expect(nextState("AGENT_RINGING", "agent", "no-answer")).toBe("AGENT_NO_ANSWER");
    expect(nextState("AGENT_RINGING", "agent", "busy")).toBe("AGENT_NO_ANSWER");
    expect(nextState("AGENT_RINGING", "agent", "failed")).toBe("AGENT_NO_ANSWER");
  });

  it("maps lead-side terminal outcomes", () => {
    expect(nextState("LEAD_RINGING", "lead", "no-answer")).toBe("NO_ANSWER");
    expect(nextState("LEAD_RINGING", "lead", "busy")).toBe("BUSY");
    expect(nextState("LEAD_RINGING", "lead", "failed")).toBe("FAILED");
  });

  it("ignores events from the wrong leg or wrong state", () => {
    expect(nextState("AGENT_RINGING", "lead", "answered")).toBeNull();
    expect(nextState("LEAD_RINGING", "agent", "answered")).toBeNull();
    expect(nextState("COMPLETED", "lead", "completed")).toBeNull();
    expect(nextState("AGENT_RINGING", "agent", "ringing")).toBeNull();
  });

  it("completes a bridged call from either leg hanging up", () => {
    expect(nextState("BRIDGED", "agent", "completed")).toBe("COMPLETED");
    expect(nextState("BRIDGED", "lead", "completed")).toBe("COMPLETED");
    expect(nextState("BRIDGED", "lead", "answered")).toBeNull();
  });

  it("never transitions out of a terminal state, and PENDING ignores events", () => {
    for (const s of TERMINAL_STATES) {
      expect(nextState(s, "agent", "completed")).toBeNull();
      expect(nextState(s, "lead", "answered")).toBeNull();
    }
    expect(nextState("PENDING", "agent", "answered")).toBeNull();
  });
});

describe("terminal helpers", () => {
  it("identifies terminal states", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("AGENT_NO_ANSWER")).toBe(true);
    expect(isTerminal("AGENT_RINGING")).toBe(false);
  });

  it("maps outcome for every terminal-ish state", () => {
    expect(outcomeForState("COMPLETED")).toBe("CONNECTED");
    expect(outcomeForState("NO_ANSWER")).toBe("NO_ANSWER");
    expect(outcomeForState("AGENT_NO_ANSWER")).toBe("NO_ANSWER");
    expect(outcomeForState("BUSY")).toBe("BUSY");
    expect(outcomeForState("FAILED")).toBe("FAILED");
    expect(outcomeForState("CANCELLED")).toBeNull();
    expect(outcomeForState("AGENT_RINGING")).toBeNull();
  });

  it("maps lead status only for lead-facing terminal states", () => {
    expect(leadStatusForState("COMPLETED")).toBe("CONNECTED");
    expect(leadStatusForState("NO_ANSWER")).toBe("NO_ANSWER");
    expect(leadStatusForState("BUSY")).toBe("BUSY");
    expect(leadStatusForState("FAILED")).toBe("FAILED");
    expect(leadStatusForState("CANCELLED")).toBe("NO_AGENT_AVAILABLE");
    // intermediate / agent-only states do not finalize the lead
    expect(leadStatusForState("AGENT_NO_ANSWER")).toBeNull();
    expect(leadStatusForState("AGENT_CONNECTED")).toBeNull();
    expect(leadStatusForState("BRIDGED")).toBeNull();
  });

  it("enumerates every state (guards against an unmapped new state)", () => {
    expect(CALL_ATTEMPT_STATE.length).toBe(11);
  });
});
