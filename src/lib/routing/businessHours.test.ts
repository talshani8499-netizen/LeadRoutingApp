import { describe, it, expect } from "vitest";
import type { BusinessHours, Holiday } from "@prisma/client";
import {
  hhmmToMinutes,
  isHoliday,
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

function holiday(partial: Partial<Holiday>): Holiday {
  return {
    id: "h",
    date: "2026-12-25",
    name: "Test",
    recurring: false,
    createdAt: new Date(),
    ...partial,
  } as Holiday;
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

  it("supports overnight windows across midnight", () => {
    // Monday 22:00 – 02:00 window (close <= open => overnight).
    const hours = [row({ dayOfWeek: 1, openMinute: 22 * 60, closeMinute: 2 * 60 })];
    // Monday 23:00 — evening portion, open.
    expect(isWithinBusinessHours(new Date("2026-06-15T23:00:00Z"), hours).open).toBe(true);
    // Tuesday 01:00 — early-morning spillover, open.
    expect(isWithinBusinessHours(new Date("2026-06-16T01:00:00Z"), hours).open).toBe(true);
    // Tuesday 03:00 — after close, closed.
    expect(isWithinBusinessHours(new Date("2026-06-16T03:00:00Z"), hours).open).toBe(false);
    // Monday 20:00 — before open, closed.
    expect(isWithinBusinessHours(new Date("2026-06-15T20:00:00Z"), hours).open).toBe(false);
  });

  it("evaluates each row in its own timezone", () => {
    // 14:00 UTC on Monday is 09:00 in New York (EDT). A NY 09:00–17:00 Monday
    // window should be open; the same instant is afternoon in UTC.
    const nyHours = [row({ dayOfWeek: 1, openMinute: 540, closeMinute: 1020, timezone: "America/New_York" })];
    expect(isWithinBusinessHours(new Date("2026-06-15T14:00:00Z"), nyHours).open).toBe(true);
    // 02:00 UTC Monday is still Sunday 22:00 in NY — closed (Sunday unconfigured).
    expect(isWithinBusinessHours(new Date("2026-06-15T02:00:00Z"), nyHours).open).toBe(false);
  });
});

describe("isHoliday", () => {
  it("matches an exact non-recurring date in the business timezone", () => {
    const now = new Date("2026-12-25T12:00:00Z");
    const res = isHoliday(now, [holiday({ date: "2026-12-25", name: "Christmas" })], "UTC");
    expect(res.holiday).toBe(true);
    expect(res.name).toBe("Christmas");
  });

  it("does not match a different year for a non-recurring holiday", () => {
    const now = new Date("2027-12-25T12:00:00Z");
    expect(isHoliday(now, [holiday({ date: "2026-12-25" })], "UTC").holiday).toBe(false);
  });

  it("matches any year for a recurring holiday (month/day only)", () => {
    const now = new Date("2030-12-25T12:00:00Z");
    expect(
      isHoliday(now, [holiday({ date: "2000-12-25", name: "Xmas", recurring: true })], "UTC").holiday,
    ).toBe(true);
  });

  it("uses the business timezone to resolve the local date", () => {
    // 2026-12-26T02:00Z is still Dec 25 in New York.
    const now = new Date("2026-12-26T02:00:00Z");
    expect(isHoliday(now, [holiday({ date: "2026-12-25" })], "America/New_York").holiday).toBe(true);
    expect(isHoliday(now, [holiday({ date: "2026-12-25" })], "UTC").holiday).toBe(false);
  });
});
