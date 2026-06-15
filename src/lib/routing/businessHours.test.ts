import { describe, it, expect } from "vitest";
import type { BusinessHours } from "@prisma/client";
import { isWithinBusinessHours, localDayAndMinute } from "./businessHours";

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

  it("is closed on a disabled / unconfigured day", () => {
    const now = new Date("2026-06-14T10:00:00Z"); // Sunday
    const hours = [row({ dayOfWeek: 1 })]; // only Monday configured
    expect(isWithinBusinessHours(now, hours).open).toBe(false);
  });
});
