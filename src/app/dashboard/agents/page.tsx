"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { agentStatusMeta } from "@/lib/labels";

interface Agent {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  priority: number;
  skills: string;
  active: boolean;
}

const STATUSES = ["AVAILABLE", "BUSY", "OFFLINE"];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "", skills: "", priority: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = await res.json();
      setAgents(j.agents ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addAgent(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(j.error ?? "Failed to add agent");
      return;
    }
    setForm({ name: "", phone: "", skills: "", priority: 0 });
    load();
  }

  async function patch(id: string, data: Partial<Agent>) {
    await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-slate-500">
          Availability, priority and skills feed directly into the routing engine. Higher priority
          is dialed first under the Priority strategy.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-x-auto">
          {loading ? (
            <div className="p-6 text-slate-400">Loading…</div>
          ) : agents.length === 0 ? (
            <div className="p-6 text-slate-400 text-sm">
              No agents yet — add your first agent using the form.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Agent</th>
                  <th className="text-left font-medium px-5 py-3 hidden md:table-cell">Skills</th>
                  <th className="text-left font-medium px-5 py-3">Pri.</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((a) => {
                  const meta = agentStatusMeta[a.status] ?? {
                    label: a.status,
                    cls: "bg-slate-100",
                  };
                  return (
                    <tr key={a.id} className={a.active ? "" : "opacity-50"}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-slate-400">{a.phone}</div>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {a.skills
                            ? a.skills.split(",").map((s, idx) => (
                                <span
                                  key={`${s}-${idx}`}
                                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500"
                                >
                                  {s.trim()}
                                </span>
                              ))
                            : <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{a.priority}</td>
                      <td className="px-5 py-3">
                        <select
                          value={a.status}
                          onChange={(e) => patch(a.id, { status: e.target.value })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {agentStatusMeta[s].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {a.active ? (
                          <ConfirmButton
                            label="Deactivate"
                            confirmLabel="Confirm?"
                            onConfirm={() => remove(a.id)}
                          />
                        ) : (
                          <button
                            className="text-xs text-brand-600 hover:underline"
                            onClick={() => patch(a.id, { active: true, status: "AVAILABLE" })}
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-5 h-fit">
          <h2 className="font-semibold mb-3">Add agent</h2>
          <form onSubmit={addAgent} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+15551230000"
                required
              />
            </div>
            <div>
              <label className="label">Skills (comma separated)</label>
              <input
                className="input"
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                placeholder="sales, support"
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <input
                type="number"
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                min={0}
                max={100}
              />
            </div>
            {err && <div className="text-xs text-red-500">{err}</div>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Adding…" : "Add agent"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
