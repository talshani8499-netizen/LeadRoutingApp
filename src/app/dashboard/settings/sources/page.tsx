"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { strategyLabel } from "@/lib/labels";

interface Source {
  id: string;
  name: string;
  label: string;
  enabled: boolean;
  routingStrategy: string;
  requiredSkill: string | null;
  priority: number;
  _count?: { leads: number };
}

const STRATEGIES = ["ROUND_ROBIN", "PRIORITY", "SKILL_BASED"];

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [form, setForm] = useState({ name: "", label: "", routingStrategy: "ROUND_ROBIN", requiredSkill: "" });
  const [err, setErr] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = await res.json();
      setSources(j.sources ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load sources");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await res.json();
    if (!res.ok) return setErr(j.error ?? "Failed");
    setForm({ name: "", label: "", routingStrategy: "ROUND_ROBIN", requiredSkill: "" });
    load();
  }

  async function patch(id: string, data: Partial<Source>) {
    await fetch(`/api/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Lead Sources</h1>
          <p className="hint mt-1">
            Where leads come from, and the default routing strategy for each. A strategy here is
            used unless a Routing Rule matches the lead first.
          </p>
        </div>
        <span className="badge badge-slate">{sources.length} sources</span>
      </div>

      {loadError && (
        <div
          role="alert"
          className="badge badge-red flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="t-head px-5 py-3">Source</th>
                  <th className="t-head px-5 py-3">Strategy</th>
                  <th className="t-head px-5 py-3">Status</th>
                  <th className="t-head px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="t-row">
                    <td className="t-cell">
                      <div className="font-medium text-slate-900">{s.label}</div>
                      <div className="text-xs text-slate-400">
                        {s.name} · {s._count?.leads ?? 0} leads
                      </div>
                    </td>
                    <td className="t-cell">
                      <select
                        aria-label={`Routing strategy for ${s.label}`}
                        value={s.routingStrategy}
                        onChange={(e) => patch(s.id, { routingStrategy: e.target.value })}
                        className="input max-w-[160px] py-1 text-xs"
                      >
                        {STRATEGIES.map((st) => (
                          <option key={st} value={st}>
                            {strategyLabel[st]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="t-cell">
                      <button
                        type="button"
                        onClick={() => patch(s.id, { enabled: !s.enabled })}
                        aria-pressed={s.enabled}
                        title={s.enabled ? "Click to disable" : "Click to enable"}
                        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
                      >
                        <span className={s.enabled ? "badge badge-green" : "badge badge-slate"}>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${s.enabled ? "bg-emerald-500" : "bg-slate-400"}`}
                            aria-hidden="true"
                          />
                          {s.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </button>
                    </td>
                    <td className="t-cell text-right">
                      <ConfirmButton label="Delete" confirmLabel="Confirm delete?" onConfirm={() => remove(s.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sources.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">No lead sources yet</p>
                <p className="hint mt-1 max-w-xs">
                  Add one so inbound leads can be tagged and routed.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="panel h-fit">
          <h2 className="section-title mb-1">Add source</h2>
          <p className="hint mb-4">The slug identifies the source in inbound payloads.</p>
          <form onSubmit={add} className="space-y-3">
            <div>
              <label className="label" htmlFor="source-slug">Slug (lowercase)</label>
              <input
                id="source-slug"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="instagram-ads"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="source-label">Display name</label>
              <input
                id="source-label"
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Instagram Ads"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="source-strategy">Strategy</label>
              <select
                id="source-strategy"
                className="input"
                value={form.routingStrategy}
                onChange={(e) => setForm({ ...form, routingStrategy: e.target.value })}
              >
                {STRATEGIES.map((st) => (
                  <option key={st} value={st}>
                    {strategyLabel[st]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="source-skill">Required skill (optional)</label>
              <input
                id="source-skill"
                className="input"
                value={form.requiredSkill}
                onChange={(e) => setForm({ ...form, requiredSkill: e.target.value })}
                placeholder="sales"
              />
              <p className="hint mt-1">Only agents with this skill receive these leads.</p>
            </div>
            {err && (
              <div role="alert" className="text-xs text-red-500">
                {err}
              </div>
            )}
            <button className="btn-primary w-full">Add source</button>
          </form>
        </div>
      </div>
    </div>
  );
}
