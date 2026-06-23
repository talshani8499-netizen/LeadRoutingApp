"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { strategyLabel } from "@/lib/labels";

interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  sourceName: string | null;
  strategy: string;
  requiredSkill: string | null;
  maxAttempts: number;
}

const STRATEGIES = ["ROUND_ROBIN", "PRIORITY", "SKILL_BASED"];

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState({
    name: "",
    order: 10,
    sourceName: "",
    strategy: "ROUND_ROBIN",
    requiredSkill: "",
    maxAttempts: 3,
  });
  const [err, setErr] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = await res.json();
      setRules(j.rules ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load rules");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await res.json();
    if (!res.ok) return setErr(j.error ?? "Failed");
    setForm({ name: "", order: 10, sourceName: "", strategy: "ROUND_ROBIN", requiredSkill: "", maxAttempts: 3 });
    load();
  }

  async function patch(id: string, data: Partial<Rule>) {
    await fetch(`/api/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Routing Rules</h1>
          <p className="hint mt-1">
            Evaluated in order (lowest first). The first match for a lead’s source wins. A rule with
            no source applies to all leads. If a rule requires a skill no available agent has, the
            lead is marked “No agent available”.
          </p>
        </div>
        <span className="badge badge-slate">{rules.length} rules</span>
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
                  <th className="t-head px-5 py-3">Order</th>
                  <th className="t-head px-5 py-3">Rule</th>
                  <th className="t-head px-5 py-3">Status</th>
                  <th className="t-head px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="t-row">
                    <td className="t-cell">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                        {r.order}
                      </span>
                    </td>
                    <td className="t-cell">
                      <div className="font-medium text-slate-900">{r.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          {r.sourceName ? `source: ${r.sourceName}` : "all sources"}
                        </span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          {strategyLabel[r.strategy]}
                        </span>
                        {r.requiredSkill && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                            skill: {r.requiredSkill}
                          </span>
                        )}
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          ≤{r.maxAttempts} tries
                        </span>
                      </div>
                    </td>
                    <td className="t-cell">
                      <button
                        type="button"
                        onClick={() => patch(r.id, { enabled: !r.enabled })}
                        aria-pressed={r.enabled}
                        title={r.enabled ? "Click to disable" : "Click to enable"}
                        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
                      >
                        <span className={r.enabled ? "badge badge-green" : "badge badge-slate"}>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${r.enabled ? "bg-emerald-500" : "bg-slate-400"}`}
                            aria-hidden="true"
                          />
                          {r.enabled ? "On" : "Off"}
                        </span>
                      </button>
                    </td>
                    <td className="t-cell text-right">
                      <ConfirmButton label="Delete" confirmLabel="Confirm delete?" onConfirm={() => remove(r.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rules.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="22" y1="6" x2="2" y2="6" />
                    <line x1="22" y1="12" x2="2" y2="12" />
                    <line x1="22" y1="18" x2="2" y2="18" />
                    <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
                    <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
                    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">No routing rules yet</p>
                <p className="hint mt-1 max-w-xs">
                  Add one to control how leads are matched to agents.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="panel h-fit">
          <h2 className="section-title mb-1">Add rule</h2>
          <p className="hint mb-4">Lower order numbers are evaluated first.</p>
          <form onSubmit={add} className="space-y-3">
            <div>
              <label className="label" htmlFor="rule-name">Name</label>
              <input
                id="rule-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="rule-order">Order</label>
                <input
                  id="rule-order"
                  type="number"
                  className="input"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label" htmlFor="rule-max">Max attempts</label>
                <input
                  id="rule-max"
                  type="number"
                  className="input"
                  value={form.maxAttempts}
                  min={1}
                  max={10}
                  onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="rule-source">Source slug (blank = all)</label>
              <input
                id="rule-source"
                className="input"
                value={form.sourceName}
                onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                placeholder="google-ads"
              />
            </div>
            <div>
              <label className="label" htmlFor="rule-strategy">Strategy</label>
              <select
                id="rule-strategy"
                className="input"
                value={form.strategy}
                onChange={(e) => setForm({ ...form, strategy: e.target.value })}
              >
                {STRATEGIES.map((st) => (
                  <option key={st} value={st}>
                    {strategyLabel[st]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rule-skill">Required skill (optional)</label>
              <input
                id="rule-skill"
                className="input"
                value={form.requiredSkill}
                onChange={(e) => setForm({ ...form, requiredSkill: e.target.value })}
              />
              <p className="hint mt-1">Leads needing this skill route only to matching agents.</p>
            </div>
            {err && (
              <div role="alert" className="text-xs text-red-500">
                {err}
              </div>
            )}
            <button className="btn-primary w-full">Add rule</button>
          </form>
        </div>
      </div>
    </div>
  );
}
