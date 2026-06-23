"use client";

import { useEffect, useState, useCallback } from "react";
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

const statusBadge: Record<string, string> = {
  AVAILABLE: "badge badge-green",
  BUSY: "badge badge-amber",
  OFFLINE: "badge badge-slate",
};

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="hint mt-1">
            Availability, priority and skills feed directly into the routing engine. Higher priority
            is dialed first under the Priority strategy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-slate">{agents.length} total</span>
          <span className="badge badge-green">
            {agents.filter((a) => a.active && a.status === "AVAILABLE").length} available
          </span>
        </div>
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
            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="skeleton h-10 w-40" />
                    <div className="skeleton h-6 w-24" />
                    <div className="skeleton ml-auto h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">No agents yet</p>
                <p className="hint mt-1 max-w-xs">
                  Add your first agent using the form to start routing leads.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="t-head px-5 py-3">Agent</th>
                    <th className="t-head hidden px-5 py-3 md:table-cell">Skills</th>
                    <th className="t-head px-5 py-3">Pri.</th>
                    <th className="t-head px-5 py-3">Status</th>
                    <th className="t-head px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const meta = agentStatusMeta[a.status] ?? { label: a.status };
                    return (
                      <tr key={a.id} className={`t-row ${a.active ? "" : "opacity-50"}`}>
                        <td className="t-cell">
                          <div className="font-medium text-slate-900">{a.name}</div>
                          <div className="text-xs text-slate-400">{a.phone}</div>
                        </td>
                        <td className="t-cell hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {a.skills ? (
                              a.skills.split(",").map((s, idx) => (
                                <span
                                  key={`${s}-${idx}`}
                                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500"
                                >
                                  {s.trim()}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </div>
                        </td>
                        <td className="t-cell text-slate-500">{a.priority}</td>
                        <td className="t-cell">
                          <span className={statusBadge[a.status] ?? "badge badge-slate"}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="t-cell">
                          <div className="flex items-center justify-end gap-3">
                            <select
                              aria-label={`Set status for ${a.name}`}
                              value={a.status}
                              onChange={(e) => patch(a.id, { status: e.target.value })}
                              className="input max-w-[140px] py-1 text-xs"
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {agentStatusMeta[s].label}
                                </option>
                              ))}
                            </select>
                            {a.active ? (
                              <ConfirmButton
                                label="Deactivate"
                                confirmLabel="Confirm?"
                                onConfirm={() => remove(a.id)}
                              />
                            ) : (
                              <button
                                type="button"
                                className="text-xs font-medium text-brand-600 hover:underline"
                                onClick={() => patch(a.id, { active: true, status: "AVAILABLE" })}
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel h-fit">
          <h2 className="section-title mb-1">Add agent</h2>
          <p className="hint mb-4">New agents start as available and join the routing pool.</p>
          <form onSubmit={addAgent} className="space-y-3">
            <div>
              <label className="label" htmlFor="agent-name">Name</label>
              <input
                id="agent-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="agent-phone">Phone</label>
              <input
                id="agent-phone"
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+15551230000"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="agent-skills">Skills (comma separated)</label>
              <input
                id="agent-skills"
                className="input"
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                placeholder="sales, support"
              />
              <p className="hint mt-1">Used by skill-based routing to match leads.</p>
            </div>
            <div>
              <label className="label" htmlFor="agent-priority">Priority</label>
              <input
                id="agent-priority"
                type="number"
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                min={0}
                max={100}
              />
            </div>
            {err && (
              <div role="alert" className="text-xs text-red-500">
                {err}
              </div>
            )}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Adding…" : "Add agent"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
