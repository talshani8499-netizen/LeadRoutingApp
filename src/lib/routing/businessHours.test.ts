import { describe, it, expect } from "vitest";
import type { BusinessHours } from "@prisma/client";
import {
  hhmmToMinutes,
  isWithinBusinessHours,
  localDayAndMinute,
  minutesToHHMM,
} from "./businessHours";

function row(partial: Partial<BusinessHours>): BusinessHours {
  return {
    id: "x",
    dayOfWeek: 1,
    openMinute: 540,
    closeMinute: 1020,
    enabled: true,
    timezone: "UTC",
    ...partial,
  } as BusinessHours;
}

describe("localDayAndMinute", () => {
  it("computes day-of-week and minute in UTC", () => {
    // 2026-06-15 is a Monday; 10:30 UTC -> day 1, minute 630
    const { dayOfWeek, minuteOfDay } = localDayAndMinute(
      new Date("2026-06-15T10:30:00Z"),
      "UTC",
    );
    expect(dayOfWeek).toBe(1);
    expect(minuteOfDay).toBe(630);
  });

  it("rolls the day back across a timezone offset (DST-aware)", () => {
    // Monday 01:00 UTC is still Sunday 21:00 in New York (EDT, -4 in June).
    const { dayOfWeek, minuteOfDay } = localDayAndMinute(
      new Date("2026-06-15T01:00:00Z"),
      "America/New_York",
    );
    expect(dayOfWeek).toBe(0); // Sunday
    expect(minuteOfDay).toBe(21 * 60);
  });
});

describe("HH:MM conversions", () => {
  it("round-trips minutes and HH:MM", () => {
    expect(minutesToHHMM(540)).toBe("09:00");
    expect(minutesToHHMM(1020)).toBe("17:00");
    expect(minutesToHHMM(1440)).toBe("00:00"); // midnight wrap
    expect(hhmmToMinutes("09:00")).toBe(540);
    expect(hhmmToMinutes("17:30")).toBe(1050);
  });
});

describe("isWithinBusinessHours", () => {
  it("treats no configuration as always open", () => {
    expect(isWithinBusinessHours(new Date(), []).open).toBe(true);
  });

  it("is open inside the configured window", () => {
    const now = new Date("2026-06-15T10:00:00Z"); // Monday 10:00
    const hours = [row({ dayOfWeek: 1, openMinute: 540, closeMinute: 1020 })];
    expect(isWithinBusinessHours(now, hours).open).toBe(true);
  });

  it("is closed before opening time", () => {
    const now = new Date("2026-06-15T07:00:00Z"); // Monday 07:00
    const hours = [row({ dayOfWeek: 1, openMinute: 540, closeMinute: 1020 })];
    expect(isWithinBusinessHours(now, hours).open).toBe(false);
  });

  it("is inclusive at open and exclusive at close", () => {
    const hours = [row({ dayOfWeek: 1, openMinute: 540, closeMinute: 1020 })];
    expect(isWithinBusinessHours(new Date("2026-06-15T09:00:00Z"), hours).open).toBe(true); // exactly open
    expect(isWithinBusinessHours(new Date("2026-06-15T17:00:00Z"), hours).open).toBe(false); // exactly close
    expect(isWithinBusinessHours(new Date("2026-06-15T16:59:00Z"), hours).open).toBe(true);
  });

  it("is closed on a disabled / unconfigured day", () => {
    const now = new Date("2026-06-14T10:00:00Z"); // Sunday
    const hours = [row({ dayOfWeek: 1 })]; // only Monday configured
    expect(isWithinBusinessHours(now, hours).open).toBe(false);
  });
});
