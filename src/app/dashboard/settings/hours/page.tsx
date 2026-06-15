"use client";

import { useEffect, useState } from "react";

interface Day {
  dayOfWeek: number;
  openMinute: number;
  closeMinute: number;
  enabled: boolean;
  timezone: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinutes = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

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
    setMsg(res.ok ? "Saved." : "Failed to save.");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Hours</h1>
        <p className="text-sm text-slate-500">
          Leads arriving outside these hours are not routed. Set a day to disabled to close it
          entirely.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-3">
          <label className="label mb-0">Timezone</label>
          <input className="input max-w-[200px]" value={tz} onChange={(e) => setTz(e.target.value)} />
        </div>

        <div className="divide-y divide-slate-100">
          {days.map((d, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
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
                className="input max-w-[130px]"
                value={toHHMM(d.openMinute)}
                disabled={!d.enabled}
                onChange={(e) => update(i, { openMinute: toMinutes(e.target.value) })}
              />
              <span className="text-slate-400">to</span>
              <input
                type="time"
                className="input max-w-[130px]"
                value={toHHMM(d.closeMinute)}
                disabled={!d.enabled}
                onChange={(e) => update(i, { closeMinute: toMinutes(e.target.value) })}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save hours"}
          </button>
          {msg && <span className="text-sm text-slate-500">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
