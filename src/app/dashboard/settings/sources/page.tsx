"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/Badge";
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

  const load = useCallback(async () => {
    const j = await fetch("/api/sources").then((r) => r.json());
    setSources(j.sources ?? []);
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lead Sources</h1>
        <p className="text-sm text-slate-500">
          Where leads come from, and the default routing strategy for each.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card divide-y divide-slate-100">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1">
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-slate-400">
                  {s.name} · {s._count?.leads ?? 0} leads
                </div>
              </div>
              <select
                value={s.routingStrategy}
                onChange={(e) => patch(s.id, { routingStrategy: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                {STRATEGIES.map((st) => (
                  <option key={st} value={st}>
                    {strategyLabel[st]}
                  </option>
                ))}
              </select>
              <button onClick={() => patch(s.id, { enabled: !s.enabled })}>
                <Badge
                  label={s.enabled ? "Enabled" : "Disabled"}
                  cls={s.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}
                />
              </button>
              <button className="text-xs text-red-500 hover:underline" onClick={() => remove(s.id)}>
                Delete
              </button>
            </div>
          ))}
          {sources.length === 0 && <div className="p-5 text-slate-400 text-sm">No sources.</div>}
        </div>

        <div className="card p-5 h-fit">
          <h2 className="font-semibold mb-3">Add source</h2>
          <form onSubmit={add} className="space-y-3">
            <div>
              <label className="label">Slug (lowercase)</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="instagram-ads"
                required
              />
            </div>
            <div>
              <label className="label">Display name</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Instagram Ads"
                required
              />
            </div>
            <div>
              <label className="label">Strategy</label>
              <select
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
              <label className="label">Required skill (optional)</label>
              <input
                className="input"
                value={form.requiredSkill}
                onChange={(e) => setForm({ ...form, requiredSkill: e.target.value })}
                placeholder="sales"
              />
            </div>
            {err && <div className="text-xs text-red-500">{err}</div>}
            <button className="btn-primary w-full">Add source</button>
          </form>
        </div>
      </div>
    </div>
  );
}
