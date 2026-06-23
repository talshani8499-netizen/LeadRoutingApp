import type { BusinessHours, Holiday } from "@prisma/client";

// Determine whether a given instant falls inside configured business hours.
// Supports overnight windows (closeMinute <= openMinute wraps past midnight),
// honors each row's own timezone, and accounts for holidays (closed dates).

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

/** Local calendar date parts (year/month/day) for an instant in a timezone. */
export function localDateParts(
  now: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Returns whether `now` is within business hours given the configured rows.
 * If no hours are configured at all, the business is treated as always open
 * (so a fresh install can route immediately).
 *
 * Each row is evaluated in its own timezone. A row whose closeMinute is less
 * than or equal to its openMinute is an overnight window that wraps past
 * midnight (e.g. 22:00–02:00), covering the evening of its own day and the
 * early morning of the next day.
 */
export function isWithinBusinessHours(
  now: Date,
  hours: BusinessHours[],
): BusinessHoursCheck {
  if (hours.length === 0) {
    return { open: true, reason: "no-hours-configured" };
  }

  for (const row of hours) {
    if (!row.enabled) continue;
    const { dayOfWeek, minuteOfDay } = localDayAndMinute(now, row.timezone || "UTC");
    const overnight = row.closeMinute <= row.openMinute;

    if (!overnight) {
      if (
        dayOfWeek === row.dayOfWeek &&
        minuteOfDay >= row.openMinute &&
        minuteOfDay < row.closeMinute
      ) {
        return { open: true, reason: "within-hours" };
      }
    } else {
      // Evening portion (open → midnight) on the row's own day…
      if (dayOfWeek === row.dayOfWeek && minuteOfDay >= row.openMinute) {
        return { open: true, reason: "within-hours" };
      }
      // …and the early-morning spillover (midnight → close) on the next day.
      if (dayOfWeek === (row.dayOfWeek + 1) % 7 && minuteOfDay < row.closeMinute) {
        return { open: true, reason: "within-hours" };
      }
    }
  }

  return { open: false, reason: "outside-hours" };
}

/** Is `now` (in the business timezone) a configured holiday? */
export function isHoliday(
  now: Date,
  holidays: Holiday[],
  timezone: string,
): { holiday: boolean; name?: string } {
  if (holidays.length === 0) return { holiday: false };
  const { year, month, day } = localDateParts(now, timezone || "UTC");

  for (const h of holidays) {
    const [hy, hm, hd] = h.date.split("-").map((n) => parseInt(n, 10));
    if (h.recurring) {
      if (hm === month && hd === day) return { holiday: true, name: h.name };
    } else if (hy === year && hm === month && hd === day) {
      return { holiday: true, name: h.name };
    }
  }
  return { holiday: false };
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
