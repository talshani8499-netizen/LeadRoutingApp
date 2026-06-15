"use client";

import { usePolling } from "@/lib/usePolling";
import { Badge } from "@/components/Badge";
import { leadStatusMeta, timeAgo } from "@/lib/labels";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  source: { name: string; label: string } | null;
  attempts: { id: string; state: string; outcome: string | null; attemptNumber: number }[];
}

interface Resp {
  ok: boolean;
  leads: Lead[];
}

export default function LeadsPage() {
  const { data, loading } = usePolling<Resp>("/api/leads", 3000);
  const leads = data?.leads ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-slate-500">Every inbound lead and its routing outcome.</p>
      </div>

      {loading && !data ? (
        <div className="text-slate-400">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No leads yet. Use “Simulate lead” to create one.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-medium px-5 py-3">Lead</th>
                <th className="text-left font-medium px-5 py-3 hidden sm:table-cell">Source</th>
                <th className="text-left font-medium px-5 py-3">Status</th>
                <th className="text-left font-medium px-5 py-3 hidden md:table-cell">Attempts</th>
                <th className="text-right font-medium px-5 py-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => {
                const meta = leadStatusMeta[l.status] ?? {
                  label: l.status,
                  cls: "bg-slate-100 text-slate-600",
                };
                return (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-slate-400">{l.phone}</div>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-slate-500">
                      {l.source?.label ?? "Direct"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge label={meta.label} cls={meta.cls} />
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-500">
                      {l.attempts.length}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-400">
                      {timeAgo(l.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
