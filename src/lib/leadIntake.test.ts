import { describe, it, expect } from "vitest";
import { mapLeadFields, parseBodyString, normalizeKey } from "./leadIntake";

describe("normalizeKey", () => {
  it("collapses case, spaces, dashes and underscores", () => {
    expect(normalizeKey("Full Name")).toBe("fullname");
    expect(normalizeKey("full_name")).toBe("fullname");
    expect(normalizeKey("full-name")).toBe("fullname");
    expect(normalizeKey("fullName")).toBe("fullname");
  });
});

describe("mapLeadFields — built-in aliases", () => {
  it("maps common single-field aliases", () => {
    const r = mapLeadFields({
      full_name: "Jane Roe",
      "your-email": "jane@example.com",
      phone_number: "202-555-0123",
      form_name: "Website",
      message: "Interested in a demo",
      submission_id: "abc-123",
    });
    expect(r).toEqual({
      name: "Jane Roe",
      email: "jane@example.com",
      phone: "202-555-0123",
      source: "Website",
      notes: "Interested in a demo",
      externalId: "abc-123",
    });
  });

  it("assembles name from first + last when no name field is present", () => {
    const r = mapLeadFields({ first_name: "Ada", last_name: "Lovelace", tel: "5551234567" });
    expect(r.name).toBe("Ada Lovelace");
    expect(r.phone).toBe("5551234567");
  });

  it("prefers an explicit name field over first/last", () => {
    const r = mapLeadFields({ name: "Grace Hopper", first_name: "Ada", last_name: "Lovelace" });
    expect(r.name).toBe("Grace Hopper");
  });

  it("ignores empty / whitespace-only values", () => {
    const r = mapLeadFields({ name: "  ", fullname: "Real Name", email: "" });
    expect(r.name).toBe("Real Name");
    expect(r.email).toBeUndefined();
  });

  it("leaves unmapped required fields absent (so validation can 422)", () => {
    const r = mapLeadFields({ q7: "mystery value" });
    expect(r.name).toBeUndefined();
    expect(r.phone).toBeUndefined();
  });
});

describe("mapLeadFields — custom map", () => {
  it("custom map wins over built-ins and handles odd field names", () => {
    const r = mapLeadFields(
      { q1_name: "Odd Field Lead", q2_tel: "5559998888", name: "Should Be Ignored" },
      { q1_name: "name", q2_tel: "phone" },
    );
    expect(r.name).toBe("Odd Field Lead");
    expect(r.phone).toBe("5559998888");
  });

  it("normalizes custom-map keys too", () => {
    const r = mapLeadFields({ "Contact Phone!!": "5551110000" }, { "contact_phone": "phone" });
    expect(r.phone).toBe("5551110000");
  });
});

describe("parseBodyString", () => {
  it("parses JSON", () => {
    expect(parseBodyString('{"name":"A","phone":"1"}', "application/json")).toEqual({
      name: "A",
      phone: "1",
    });
  });

  it("parses urlencoded", () => {
    expect(
      parseBodyString("full_name=Jane+Roe&phone_number=5551234567", "application/x-www-form-urlencoded"),
    ).toEqual({ full_name: "Jane Roe", phone_number: "5551234567" });
  });

  it("unwraps one nesting level (relay-style {data:{...}})", () => {
    expect(parseBodyString('{"data":{"name":"Nested"}}', "application/json")).toMatchObject({
      name: "Nested",
    });
  });

  it("falls back to urlencoded when content-type is missing", () => {
    expect(parseBodyString("name=X&phone=1")).toEqual({ name: "X", phone: "1" });
  });
});
