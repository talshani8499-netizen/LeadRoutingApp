"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";

interface Day {
  dayOfWeek: number;
  openMinute: number;
  closeMinute: number;
  enabled: boolean;
  timezone: string;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  recurring: boolean;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinutes = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// IANA timezones for the picker, with a safe fallback for older runtimes.
function timezoneList(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf?.("timeZone");
    if (supported && supported.length) return supported;
  } catch {
    /* fall through */
  }
  return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Jerusalem"];
}

function emptyWeek(): Day[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    openMinute: 540,
    closeMinute: 1020,
    enabled: i >= 1 && i <= 5,
    timezone: "UTC",
  }));
}

export default function HoursPage() {
  const [days, setDays] = useState<Day[]>(emptyWeek());
  const [tz, setTz] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const zones = timezoneList();

  useEffect(() => {
    fetch("/api/hours")
      .then((r) => r.json())
      .then((j) => {
        if (j.hours?.length) {
          const byDay = emptyWeek();
          for (const h of j.hours as Day[]) byDay[h.dayOfWeek] = h;
          setDays(byDay);
          setTz(j.hours[0].timezone ?? "UTC");
        }
      })
      .catch(() => {});
  }, []);

  function update(i: number, patch: Partial<Day>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: days.map((d) => ({ ...d, timezone: tz })) }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved." : "Failed to save — check that open and close times differ.");
  }

  const saved = msg === "Saved.";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Business Hours</h1>
          <p className="hint mt-1">
            Leads arriving outside these hours (or on a holiday) are not routed. Set a closing time
            earlier than the opening time for an overnight window (e.g. 22:00 → 02:00).
          </p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save hours"}
        </button>
      </div>

      <div className="panel space-y-4">
        <div>
          <label className="label" htmlFor="hours-tz">Timezone</label>
          <select
            id="hours-tz"
            className="input max-w-[280px]"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
          >
            {!zones.includes(tz) && <option value={tz}>{tz}</option>}
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className="hint mt-1">All open and close times are interpreted in this timezone.</p>
        </div>

        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {days.map((d, i) => {
            const overnight = d.enabled && d.closeMinute <= d.openMinute;
            return (
              <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <label className="flex w-32 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                    checked={d.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                  />
                  <span className={`text-sm font-medium ${d.enabled ? "text-slate-800" : "text-slate-400"}`}>
                    {DAY_NAMES[d.dayOfWeek]}
                  </span>
                </label>
                <input
                  type="time"
                  aria-label={`${DAY_NAMES[d.dayOfWeek]} opening time`}
                  className="input max-w-[130px]"
                  value={toHHMM(d.openMinute)}
                  disabled={!d.enabled}
                  onChange={(e) => update(i, { openMinute: toMinutes(e.target.value) })}
                />
                <span className="text-slate-400">to</span>
                <input
                  type="time"
                  aria-label={`${DAY_NAMES[d.dayOfWeek]} closing time`}
                  className="input max-w-[130px]"
                  value={toHHMM(d.closeMinute)}
                  disabled={!d.enabled}
                  onChange={(e) => update(i, { closeMinute: toMinutes(e.target.value) })}
                />
                {overnight && (
                  <span className="badge badge-blue">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                    overnight
                  </span>
                )}
                {!d.enabled && <span className="text-xs text-slate-400">Closed</span>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save hours"}
          </button>
          {msg && (
            <span
              className={`inline-flex items-center gap-1.5 text-sm ${saved ? "text-emerald-600" : "text-red-600"}`}
              role="status"
            >
              {saved && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {msg}
            </span>
          )}
        </div>
      </div>

      <Holidays />
    </div>
  );
}

function Holidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [form, setForm] = useState({ date: "", name: "", recurring: false });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/holidays");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = await res.json();
      setHolidays(j.holidays ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load holidays");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await res.json();
    if (!res.ok) return setErr(j.error ?? "Failed to add holiday");
    setForm({ date: "", name: "", recurring: false });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="panel">
      <h2 className="section-title">Holidays</h2>
      <p className="hint mb-4 mt-1">
        Dates the business is closed. Mark a holiday “recurring” to repeat it every year.
      </p>

      {err && (
        <div
          role="alert"
          className="badge badge-red mb-3 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {err}
        </div>
      )}

      <div className="mb-4 divide-y divide-slate-100">
        {holidays.map((h) => (
          <div key={h.id} className="flex items-center gap-3 py-2.5">
            <span className="w-28 font-mono text-sm text-slate-600">{h.date}</span>
            <span className="flex-1 text-sm text-slate-800">{h.name}</span>
            {h.recurring && (
              <span className="badge badge-blue">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                yearly
              </span>
            )}
            <ConfirmButton label="Remove" confirmLabel="Confirm?" onConfirm={() => remove(h.id)} />
          </div>
        ))}
        {holidays.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700">No holidays yet</p>
            <p className="hint mt-1 max-w-xs">Add dates the business should be closed.</p>
          </div>
        )}
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
        <div>
          <label className="label" htmlFor="holiday-date">Date</label>
          <input
            id="holiday-date"
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="label" htmlFor="holiday-name">Name</label>
          <input
            id="holiday-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="New Year's Day"
            required
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            checked={form.recurring}
            onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
          />
          Recurring
        </label>
        <button className="btn-primary">Add holiday</button>
      </form>
    </div>
  );
}
