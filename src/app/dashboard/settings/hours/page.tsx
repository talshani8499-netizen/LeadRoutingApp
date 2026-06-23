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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Hours</h1>
        <p className="text-sm text-slate-500">
          Leads arriving outside these hours (or on a holiday) are not routed. Set a closing time
          earlier than the opening time for an overnight window (e.g. 22:00 → 02:00).
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-3">
          <label className="label mb-0" htmlFor="hours-tz">Timezone</label>
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
        </div>

        <div className="divide-y divide-slate-100">
          {days.map((d, i) => {
            const overnight = d.enabled && d.closeMinute <= d.openMinute;
            return (
              <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <label className="flex items-center gap-2 w-32">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                  />
                  <span className={`text-sm font-medium ${d.enabled ? "" : "text-slate-400"}`}>
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
                  <span className="text-[11px] font-medium text-indigo-500">overnight →</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save hours"}
          </button>
          {msg && <span className="text-sm text-slate-500">{msg}</span>}
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
    <div className="card p-5">
      <h2 className="font-semibold">Holidays</h2>
      <p className="text-sm text-slate-500 mb-4">
        Dates the business is closed. Mark a holiday “recurring” to repeat it every year.
      </p>

      {err && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 mb-3">
          {err}
        </div>
      )}

      <div className="divide-y divide-slate-100 mb-4">
        {holidays.map((h) => (
          <div key={h.id} className="flex items-center gap-3 py-2.5">
            <span className="font-mono text-sm text-slate-600 w-28">{h.date}</span>
            <span className="flex-1 text-sm">{h.name}</span>
            {h.recurring && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                yearly
              </span>
            )}
            <ConfirmButton label="Remove" confirmLabel="Confirm?" onConfirm={() => remove(h.id)} />
          </div>
        ))}
        {holidays.length === 0 && (
          <div className="py-3 text-sm text-slate-400">
            No holidays yet — add dates the business should be closed.
          </div>
        )}
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
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
        <div className="flex-1 min-w-[160px]">
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
        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
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
