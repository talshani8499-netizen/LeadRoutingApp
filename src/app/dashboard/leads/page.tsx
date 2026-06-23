"use client";

import { usePolling } from "@/lib/usePolling";
import { Badge } from "@/components/Badge";
import { StaleBanner } from "@/components/StaleBanner";
import { leadStatusMeta, outcomeMeta, callStateMeta, timeAgo } from "@/lib/labels";

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

// Surface the most recent attempt's resolved outcome (falling back to its live
// state) so the table can show "where did this lead end up".
function lastAttemptMeta(attempts: Lead["attempts"]): { label: string; cls: string } | null {
  if (attempts.length === 0) return null;
  const last = attempts[attempts.length - 1];
  if (last.outcome && outcomeMeta[last.outcome]) return outcomeMeta[last.outcome];
  return callStateMeta[last.state] ?? { label: last.state, cls: "bg-slate-100 text-slate-600" };
}

function LeadsRowSkeleton() {
  return (
    <tr className="t-row">
      <td className="t-cell px-5">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-2 h-3 w-28" />
      </td>
      <td className="t-cell px-5 hidden sm:table-cell">
        <div className="skeleton h-5 w-20 rounded-full" />
      </td>
      <td className="t-cell px-5">
        <div className="skeleton h-5 w-24 rounded-full" />
      </td>
      <td className="t-cell px-5 hidden md:table-cell">
        <div className="skeleton h-5 w-24 rounded-full" />
      </td>
      <td className="t-cell px-5 text-right">
        <div className="skeleton ml-auto h-3 w-16" />
      </td>
    </tr>
  );
}

export default function LeadsPage() {
  const { data, loading, error, lastUpdated } = usePolling<Resp>("/api/leads", 3000);
  const leads = data?.leads ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="hint mt-1">Every inbound lead and its routing outcome.</p>
        </div>
        <div>
          {!loading && (
            <span className="badge badge-slate">
              {leads.length} {leads.length === 1 ? "lead" : "leads"}
            </span>
          )}
        </div>
      </div>

      <StaleBanner error={error} lastUpdated={lastUpdated} />

      <div className="card overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="t-head px-5 py-3">Lead</th>
              <th className="t-head px-5 py-3 hidden sm:table-cell">Source</th>
              <th className="t-head px-5 py-3">Status</th>
              <th className="t-head px-5 py-3 hidden md:table-cell">Last attempt</th>
              <th className="t-head px-5 py-3 text-right">Received</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              Array.from({ length: 6 }).map((_, i) => <LeadsRowSkeleton key={i} />)
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <div className="font-medium text-slate-700">No leads yet</div>
                  <div className="mt-1 text-sm text-slate-400">
                    Use “Simulate lead” in the top bar to create one.
                  </div>
                </td>
              </tr>
            ) : (
              leads.map((l) => {
                const meta = leadStatusMeta[l.status] ?? {
                  label: l.status,
                  cls: "bg-slate-100 text-slate-600",
                };
                const last = lastAttemptMeta(l.attempts);
                return (
                  <tr key={l.id} className="t-row hover:bg-slate-50/60">
                    <td className="t-cell px-5">
                      <div className="font-medium text-slate-900">{l.name}</div>
                      <div className="text-xs text-slate-400">{l.phone}</div>
                    </td>
                    <td className="t-cell px-5 hidden sm:table-cell">
                      {l.source ? (
                        <span className="badge badge-blue">{l.source.label}</span>
                      ) : (
                        <span className="badge badge-slate">Direct</span>
                      )}
                    </td>
                    <td className="t-cell px-5">
                      <Badge label={meta.label} cls={meta.cls} />
                    </td>
                    <td className="t-cell px-5 hidden md:table-cell">
                      {last ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge label={last.label} cls={last.cls} />
                          {l.attempts.length > 1 && (
                            <span className="text-xs text-slate-400">×{l.attempts.length}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">No attempts</span>
                      )}
                    </td>
                    <td className="t-cell px-5 text-right text-xs text-slate-400">
                      {timeAgo(l.createdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
