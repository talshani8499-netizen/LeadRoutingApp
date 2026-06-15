import { describe, it, expect } from "vitest";
import {
  slugify,
  normalizePhone,
  businessHoursDaySchema,
  agentCreateSchema,
  sourceCreateSchema,
  ruleCreateSchema,
} from "./validation";

describe("slugify", () => {
  it("produces a safe slug matching the source-name regex", () => {
    expect(slugify("Facebook Ads")).toBe("facebook-ads");
    expect(slugify("  Google   Ads!! ")).toBe("google-ads");
    expect(slugify("@@@")).toBe("source");
    expect(/^[a-z0-9-_]+$/.test(slugify("Instagram Ads"))).toBe(true);
  });
});

describe("boolean coercion", () => {
  const base = { name: "A", phone: "+15551230000" };
  it("treats the string 'false' as false (not truthy)", () => {
    expect(agentCreateSchema.parse({ ...base, active: "false" }).active).toBe(false);
    expect(agentCreateSchema.parse({ ...base, active: "true" }).active).toBe(true);
  });
  it("handles other falsy/truthy string forms", () => {
    expect(agentCreateSchema.parse({ ...base, active: "0" }).active).toBe(false);
    expect(agentCreateSchema.parse({ ...base, active: "no" }).active).toBe(false);
    expect(agentCreateSchema.parse({ ...base, active: "on" }).active).toBe(true);
    // omitted -> default true
    expect(agentCreateSchema.parse(base).active).toBe(true);
  });
});

describe("phone validation", () => {
  const ok = (phone: string) =>
    agentCreateSchema.safeParse({ name: "A", phone }).success;
  it("rejects too-short / non-numeric / too-few-digit phones", () => {
    expect(ok("123")).toBe(false);
    expect(ok("abc-defg")).toBe(false);
    expect(ok("().- ()")).toBe(false);
  });
  it("accepts common valid formats", () => {
    expect(ok("+1 (202) 555-0100")).toBe(true);
    expect(ok("202-555-0100")).toBe(true);
  });
});

describe("source + rule schemas", () => {
  it("enforces the source slug regex", () => {
    expect(sourceCreateSchema.safeParse({ name: "Facebook Ads", label: "x" }).success).toBe(false);
    expect(sourceCreateSchema.safeParse({ name: "facebook_ads", label: "x" }).success).toBe(true);
    expect(sourceCreateSchema.safeParse({ name: "fb-ads", label: "x" }).success).toBe(true);
  });
  it("clamps rule maxAttempts and applies defaults", () => {
    expect(ruleCreateSchema.parse({ name: "R" }).maxAttempts).toBe(3);
    expect(ruleCreateSchema.safeParse({ name: "R", maxAttempts: 0 }).success).toBe(false);
    expect(ruleCreateSchema.safeParse({ name: "R", maxAttempts: 11 }).success).toBe(false);
    expect(ruleCreateSchema.parse({ name: "R", maxAttempts: "5" }).maxAttempts).toBe(5);
  });
});

describe("business hours validation", () => {
  it("rejects an enabled day where open is not before close", () => {
    expect(
      businessHoursDaySchema.safeParse({ dayOfWeek: 1, openMinute: 1020, closeMinute: 540, enabled: true })
        .success,
    ).toBe(false);
  });
  it("allows a disabled day regardless of times", () => {
    expect(
      businessHoursDaySchema.safeParse({ dayOfWeek: 1, openMinute: 1020, closeMinute: 540, enabled: false })
        .success,
    ).toBe(true);
  });
});

describe("normalizePhone", () => {
  it("keeps an explicit + prefix and strips formatting", () => {
    expect(normalizePhone("+1 (202) 555-0100")).toBe("+12025550100");
  });
  it("adds +1 to a bare 10-digit US number", () => {
    expect(normalizePhone("202-555-0100")).toBe("+12025550100");
  });
});
