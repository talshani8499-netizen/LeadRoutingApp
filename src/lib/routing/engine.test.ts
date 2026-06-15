import { describe, it, expect } from "vitest";
import type { Agent } from "@prisma/client";
import { pickAgent } from "./engine";

function agent(partial: Partial<Agent>): Agent {
  return {
    id: "a",
    name: "Agent",
    phone: "+1000",
    email: null,
    status: "AVAILABLE",
    priority: 0,
    skills: "",
    active: true,
    lastRoutedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Agent;
}

describe("pickAgent", () => {
  it("returns null when there are no candidates", () => {
    expect(pickAgent("ROUND_ROBIN", [])).toBeNull();
  });

  it("round-robin prefers the least-recently-routed agent", () => {
    const a = agent({ id: "a", lastRoutedAt: new Date("2026-01-01") });
    const b = agent({ id: "b", lastRoutedAt: null }); // never routed -> oldest
    const c = agent({ id: "c", lastRoutedAt: new Date("2026-06-01") });
    expect(pickAgent("ROUND_ROBIN", [a, b, c])?.id).toBe("b");
  });

  it("priority picks the highest-priority agent", () => {
    const a = agent({ id: "a", priority: 1 });
    const b = agent({ id: "b", priority: 9 });
    const c = agent({ id: "c", priority: 5 });
    expect(pickAgent("PRIORITY", [a, b, c])?.id).toBe("b");
  });

  it("priority breaks ties by least-recently-routed", () => {
    const a = agent({ id: "a", priority: 5, lastRoutedAt: new Date("2026-06-01") });
    const b = agent({ id: "b", priority: 5, lastRoutedAt: new Date("2026-01-01") });
    expect(pickAgent("PRIORITY", [a, b])?.id).toBe("b");
  });
});
