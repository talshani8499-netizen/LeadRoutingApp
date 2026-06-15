import type { BusinessHours } from "@prisma/client";

// Determine whether a given instant falls inside configured business hours.
// Business hours rows are keyed by day-of-week with open/close minutes from
// midnight in the row's timezone.

export interface BusinessHoursCheck {
  open: boolean;
  reason: string;
}

/**
 * Convert an absolute instant into {dayOfWeek, minuteOfDay} as observed in the
 * given IANA timezone, using Intl so we avoid pulling in a date library.
 */
export function localDayAndMinute(
  now: Date,
  timezone: string,
): { dayOfWeek: number; minuteOfDay: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl can emit "24" for midnight in hour23 mode; normalize.
  if (hour === 24) hour = 0;

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? 0;
  return { dayOfWeek, minuteOfDay: hour * 60 + minute };
}

/**
 * Returns whether `now` is within business hours given the configured rows.
 * If no hours are configured at all, the business is treated as always open
 * (so a fresh install can route immediately).
 */
export function isWithinBusinessHours(
  now: Date,
  hours: BusinessHours[],
): BusinessHoursCheck {
  if (hours.length === 0) {
    return { open: true, reason: "no-hours-configured" };
  }

  // All rows share a timezone in this MVP; use the first row's tz.
  const timezone = hours[0].timezone || "UTC";
  const { dayOfWeek, minuteOfDay } = localDayAndMinute(now, timezone);

  const today = hours.find((h) => h.dayOfWeek === dayOfWeek);
  if (!today || !today.enabled) {
    return { open: false, reason: "closed-today" };
  }

  const open = minuteOfDay >= today.openMinute && minuteOfDay < today.closeMinute;
  return {
    open,
    reason: open ? "within-hours" : "outside-hours",
  };
}

/** Render minutes-from-midnight as HH:MM for display. */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parse an HH:MM string into minutes from midnight. */
export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}
