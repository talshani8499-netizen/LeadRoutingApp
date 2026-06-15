import { describe, it, expect } from "vitest";
import {
  isTerminal,
  leadStatusForState,
  nextState,
  outcomeForState,
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
});

describe("terminal helpers", () => {
  it("identifies terminal states", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("AGENT_NO_ANSWER")).toBe(true);
    expect(isTerminal("AGENT_RINGING")).toBe(false);
  });

  it("maps outcome and lead status", () => {
    expect(outcomeForState("COMPLETED")).toBe("CONNECTED");
    expect(outcomeForState("BUSY")).toBe("BUSY");
    expect(leadStatusForState("COMPLETED")).toBe("CONNECTED");
    expect(leadStatusForState("CANCELLED")).toBe("NO_AGENT_AVAILABLE");
    // agent no-answer does not finalize the lead (fallback continues)
    expect(leadStatusForState("AGENT_NO_ANSWER")).toBeNull();
  });
});
