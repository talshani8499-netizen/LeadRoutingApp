"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/Badge";
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

  const load = useCallback(async () => {
    const j = await fetch("/api/rules").then((r) => r.json());
    setRules(j.rules ?? []);
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Routing Rules</h1>
        <p className="text-sm text-slate-500">
          Evaluated in order (lowest first). The first match for a lead’s source wins. A rule with
          no source applies to all leads.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card divide-y divide-slate-100">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-8 text-center text-xs font-semibold text-slate-400">{r.order}</span>
              <div className="flex-1">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-400">
                  {r.sourceName ? `source: ${r.sourceName}` : "all sources"} ·{" "}
                  {strategyLabel[r.strategy]}
                  {r.requiredSkill ? ` · skill: ${r.requiredSkill}` : ""} · ≤{r.maxAttempts} tries
                </div>
              </div>
              <button onClick={() => patch(r.id, { enabled: !r.enabled })}>
                <Badge
                  label={r.enabled ? "On" : "Off"}
                  cls={r.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}
                />
              </button>
              <button className="text-xs text-red-500 hover:underline" onClick={() => remove(r.id)}>
                Delete
              </button>
            </div>
          ))}
          {rules.length === 0 && <div className="p-5 text-slate-400 text-sm">No rules.</div>}
        </div>

        <div className="card p-5 h-fit">
          <h2 className="font-semibold mb-3">Add rule</h2>
          <form onSubmit={add} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Order</label>
                <input
                  type="number"
                  className="input"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Max attempts</label>
                <input
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
              <label className="label">Source slug (blank = all)</label>
              <input
                className="input"
                value={form.sourceName}
                onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                placeholder="google-ads"
              />
            </div>
            <div>
              <label className="label">Strategy</label>
              <select
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
              <label className="label">Required skill (optional)</label>
              <input
                className="input"
                value={form.requiredSkill}
                onChange={(e) => setForm({ ...form, requiredSkill: e.target.value })}
              />
            </div>
            {err && <div className="text-xs text-red-500">{err}</div>}
            <button className="btn-primary w-full">Add rule</button>
          </form>
        </div>
      </div>
    </div>
  );
}
