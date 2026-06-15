import { describe, it, expect } from "vitest";
import {
  slugify,
  normalizePhone,
  businessHoursDaySchema,
  agentCreateSchema,
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
  it("treats the string 'false' as false (not truthy)", () => {
    expect(agentCreateSchema.parse({ name: "A", phone: "+15551230000", active: "false" }).active).toBe(false);
    expect(agentCreateSchema.parse({ name: "A", phone: "+15551230000", active: "true" }).active).toBe(true);
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
