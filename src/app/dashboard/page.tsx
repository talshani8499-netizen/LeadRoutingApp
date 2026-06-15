"use client";

import { usePolling } from "@/lib/usePolling";
import { formatDuration } from "@/lib/labels";
import { StaleBanner } from "@/components/StaleBanner";
import type { DashboardMetrics } from "@/lib/analytics";

interface Resp {
  ok: boolean;
  metrics: DashboardMetrics;
}

const OUTCOME_COLORS: Record<string, string> = {
  CONNECTED: "bg-emerald-500",
  NO_ANSWER: "bg-orange-400",
  BUSY: "bg-yellow-400",
  FAILED: "bg-red-400",
};

const OUTCOME_LABELS: Record<string, string> = {
  CONNECTED: "Connected",
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  FAILED: "Failed",
};

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function OverviewPage() {
  const { data, loading, error, lastUpdated } = usePolling<Resp>("/api/analytics", 2500);
  const m = data?.metrics;

  if (loading && !m) {
    return <div className="text-slate-400">Loading dashboard…</div>;
  }
  if (!m) {
    return (
      <div className="card p-6 text-sm text-red-600">
        Couldn’t load dashboard data. {error ?? ""}
      </div>
    );
  }

  const outcomeTotal =
    m.outcomes.CONNECTED + m.outcomes.NO_ANSWER + m.outcomes.BUSY + m.outcomes.FAILED;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-slate-500">Real-time routing performance and call outcomes.</p>
      </div>

      <StaleBanner error={error} lastUpdated={lastUpdated} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Leads today" value={m.totals.leadsToday} sub={`${m.totals.leads} total`} />
        <Kpi
          label="Active calls"
          value={m.totals.activeCalls}
          sub={m.totals.activeCalls > 0 ? "live now" : "idle"}
        />
        <Kpi
          label="Connect rate"
          value={`${Math.round(m.connectRate * 100)}%`}
          sub={`${outcomeTotal} completed`}
        />
        <Kpi
          label="Agents available"
          value={`${m.totals.agentsAvailable}/${m.totals.agents}`}
          sub="ready to take calls"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outcome breakdown */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Call outcomes</h2>
            <span className="text-xs text-slate-400">avg talk {formatDuration(m.avgTalkTimeSec)}</span>
          </div>
          {outcomeTotal === 0 ? (
            <EmptyHint text="No completed calls yet. Click “Simulate lead” to start the flow." />
          ) : (
            <div className="space-y-3">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {(["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"] as const).map((k) =>
                  m.outcomes[k] > 0 ? (
                    <div
                      key={k}
                      className={OUTCOME_COLORS[k]}
                      style={{ width: `${(m.outcomes[k] / outcomeTotal) * 100}%` }}
                      title={`${OUTCOME_LABELS[k]}: ${m.outcomes[k]}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {(["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${OUTCOME_COLORS[k]}`} />
                    <div className="text-sm">
                      <div className="font-medium">{m.outcomes[k]}</div>
                      <div className="text-xs text-slate-400">{OUTCOME_LABELS[k]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Agent leaderboard */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Top agents</h2>
          {m.agentLeaderboard.length === 0 ? (
            <EmptyHint text="No agents yet." />
          ) : (
            <ul className="space-y-3">
              {m.agentLeaderboard.map((a, i) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span className="h-7 w-7 shrink-0 grid place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">{a.name}</span>
                  <span className="text-sm text-emerald-600 font-semibold">{a.connected}</span>
                  <span className="text-xs text-slate-400">/ {a.attempts}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Lead status distribution */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4">Lead pipeline</h2>
        {Object.keys(m.leadStatus).length === 0 ? (
          <EmptyHint text="No leads yet." />
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(m.leadStatus).map(([status, count]) => (
              <div
                key={status}
                className="rounded-xl border border-slate-200 px-4 py-3 min-w-[120px]"
              >
                <div className="text-2xl font-semibold">{count}</div>
                <div className="text-xs text-slate-400">{status.replace(/_/g, " ").toLowerCase()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="text-sm text-slate-400 py-6 text-center">{text}</div>;
}
