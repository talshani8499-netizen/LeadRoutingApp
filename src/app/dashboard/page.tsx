"use client";

import { usePolling } from "@/lib/usePolling";
import { formatDuration, leadStatusMeta } from "@/lib/labels";
import { Badge } from "@/components/Badge";
import { StaleBanner } from "@/components/StaleBanner";
import type { DashboardMetrics } from "@/lib/analytics";

interface Resp {
  ok: boolean;
  metrics: DashboardMetrics;
}

type OutcomeKey = "CONNECTED" | "NO_ANSWER" | "BUSY" | "FAILED";

const OUTCOME_ORDER: OutcomeKey[] = ["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"];

const OUTCOME_META: Record<OutcomeKey, { label: string; bar: string; dot: string }> = {
  CONNECTED: { label: "Connected", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  NO_ANSWER: { label: "No answer", bar: "bg-amber-400", dot: "bg-amber-400" },
  BUSY: { label: "Busy", bar: "bg-yellow-400", dot: "bg-yellow-400" },
  FAILED: { label: "Failed", bar: "bg-red-400", dot: "bg-red-400" },
};

// Lead statuses that represent work still moving through the pipeline. Used to
// build the "live pipeline" preview from data the analytics endpoint already
// returns (no extra polling).
const LIVE_STATUS_ORDER = [
  "NEW",
  "VALIDATING",
  "ROUTING",
  "IN_PROGRESS",
] as const;

const PIPELINE_ORDER = [
  "NEW",
  "VALIDATING",
  "ROUTING",
  "IN_PROGRESS",
  "CONNECTED",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
  "NO_AGENT_AVAILABLE",
] as const;

/* ---------- Icons (inline, stroke, currentColor) ---------- */

function IconBase({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconInbox = () => (
  <IconBase>
    <path d="M4 13h4l1.5 3h5L16 13h4" />
    <path d="M4 13 6 5h12l2 8v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z" />
  </IconBase>
);

const IconPhone = () => (
  <IconBase>
    <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </IconBase>
);

const IconTrend = () => (
  <IconBase>
    <path d="M3 17l6-6 4 4 7-8" />
    <path d="M21 7v5h-5" />
  </IconBase>
);

const IconUsers = () => (
  <IconBase>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.8" />
    <path d="M18 14a6 6 0 0 1 3 5" />
  </IconBase>
);

const IconBolt = () => (
  <IconBase>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </IconBase>
);

const IconList = () => (
  <IconBase>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1" />
    <circle cx="3.5" cy="12" r="1" />
    <circle cx="3.5" cy="18" r="1" />
  </IconBase>
);

/* ---------- Stat tile ---------- */

function StatTile({
  label,
  value,
  caption,
  icon,
  accent,
  live = false,
}: {
  label: string;
  value: string | number;
  caption?: string;
  icon: React.ReactNode;
  accent?: React.ReactNode;
  live?: boolean;
}) {
  return (
    <div className="panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="stat-label">{label}</div>
          <div className="stat-value tabular-nums">{value}</div>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          {icon}
        </span>
      </div>
      {(caption || accent) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          {live && (
            <span className="text-emerald-500">
              <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          )}
          {accent}
          {caption && <span className="truncate">{caption}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- Empty / loading helpers ---------- */

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-50 text-slate-400">
        <IconList />
      </span>
      <div className="text-sm font-medium text-slate-600">{text}</div>
      {hint && <div className="hint max-w-xs">{hint}</div>}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="skeleton h-7 w-40" />
          <div className="skeleton mt-2 h-4 w-64" />
        </div>
        <div className="skeleton h-6 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel">
            <div className="flex items-start justify-between">
              <div className="w-full">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton mt-3 h-8 w-16" />
              </div>
              <div className="skeleton h-10 w-10 rounded-xl" />
            </div>
            <div className="skeleton mt-4 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton mt-5 h-3 w-full rounded-full" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="skeleton h-4 w-28" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function OverviewPage() {
  const { data, loading, error, lastUpdated } = usePolling<Resp>("/api/analytics", 2500);
  const m = data?.metrics;

  if (loading && !m) {
    return <OverviewSkeleton />;
  }
  if (!m) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="hint mt-1">Real-time routing performance and call outcomes.</p>
        </div>
        <div className="panel">
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-500">
              <IconBolt />
            </span>
            <div className="text-sm font-medium text-slate-700">
              Couldn&rsquo;t load dashboard data
            </div>
            {error && <div className="hint">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  const outcomeTotal =
    m.outcomes.CONNECTED + m.outcomes.NO_ANSWER + m.outcomes.BUSY + m.outcomes.FAILED;
  const connectPct = Math.round(m.connectRate * 100);

  // Leaderboard talk-time / connected ranking is already computed server-side;
  // we derive a max only for the inline bar scale.
  const topConnected = m.agentLeaderboard.reduce((max, a) => Math.max(max, a.connected), 0);

  // Live pipeline preview, built from leadStatus counts that the analytics
  // endpoint already returns — no additional polling.
  const liveCount = LIVE_STATUS_ORDER.reduce((sum, s) => sum + (m.leadStatus[s] ?? 0), 0);

  const pipelineEntries = PIPELINE_ORDER.filter((s) => (m.leadStatus[s] ?? 0) > 0).map((s) => ({
    status: s,
    count: m.leadStatus[s] ?? 0,
  }));
  // Include any statuses not in our known order so nothing is hidden.
  for (const [status, count] of Object.entries(m.leadStatus)) {
    if (!PIPELINE_ORDER.includes(status as (typeof PIPELINE_ORDER)[number]) && count > 0) {
      pipelineEntries.push({ status: status as (typeof PIPELINE_ORDER)[number], count });
    }
  }

  const updatedSecs = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="hint mt-1">Real-time routing performance and call outcomes.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-slate-500">
          {error ? (
            <span className="badge badge-amber">Reconnecting</span>
          ) : (
            <span className="badge badge-green">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          {updatedSecs !== null && (
            <span className="tabular-nums">
              updated {updatedSecs === 0 ? "just now" : `${updatedSecs}s ago`}
            </span>
          )}
        </div>
      </div>

      <StaleBanner error={error} lastUpdated={lastUpdated} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Leads today"
          value={m.totals.leadsToday}
          icon={<IconInbox />}
          caption={`${m.totals.leads} total all-time`}
        />
        <StatTile
          label="Active calls"
          value={m.totals.activeCalls}
          icon={<IconPhone />}
          live={m.totals.activeCalls > 0}
          caption={m.totals.activeCalls > 0 ? "live now" : "idle — no calls in flight"}
        />
        <StatTile
          label="Connect rate"
          value={`${connectPct}%`}
          icon={<IconTrend />}
          caption={`${outcomeTotal} call${outcomeTotal === 1 ? "" : "s"} completed`}
        />
        <StatTile
          label="Agents available"
          value={`${m.totals.agentsAvailable}/${m.totals.agents}`}
          icon={<IconUsers />}
          caption="ready to take calls"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Call outcome breakdown */}
        <section className="panel lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title">Call outcomes</h2>
            <span className="hint tabular-nums">avg talk {formatDuration(m.avgTalkTimeSec)}</span>
          </div>
          {outcomeTotal === 0 ? (
            <EmptyState
              text="No completed calls yet"
              hint="Use “Simulate lead” in the top bar to route a lead and watch outcomes land here."
            />
          ) : (
            <div className="space-y-4">
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`Call outcomes: ${OUTCOME_ORDER.map(
                  (k) => `${OUTCOME_META[k].label} ${m.outcomes[k]}`,
                ).join(", ")}`}
              >
                {OUTCOME_ORDER.map((k) =>
                  m.outcomes[k] > 0 ? (
                    <div
                      key={k}
                      className={OUTCOME_META[k].bar}
                      style={{ width: `${(m.outcomes[k] / outcomeTotal) * 100}%` }}
                      title={`${OUTCOME_META[k].label}: ${m.outcomes[k]}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {OUTCOME_ORDER.map((k) => {
                  const count = m.outcomes[k];
                  const pct = outcomeTotal > 0 ? Math.round((count / outcomeTotal) * 100) : 0;
                  return (
                    <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${OUTCOME_META[k].dot}`} />
                        <span className="text-xs font-medium text-slate-500">
                          {OUTCOME_META[k].label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className="text-xl font-semibold tabular-nums text-slate-900">
                          {count}
                        </span>
                        <span className="text-xs text-slate-400 tabular-nums">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Agent leaderboard */}
        <section className="panel">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title">Top agents</h2>
            <span className="hint">by connected</span>
          </div>
          {m.agentLeaderboard.length === 0 ? (
            <EmptyState text="No agents yet" hint="Add agents in Settings to start routing calls." />
          ) : (
            <ol className="space-y-1.5">
              {m.agentLeaderboard.map((a, i) => {
                const rank = i + 1;
                const rankCls =
                  rank === 1
                    ? "bg-amber-100 text-amber-700"
                    : rank === 2
                      ? "bg-slate-200 text-slate-600"
                      : rank === 3
                        ? "bg-orange-100 text-orange-700"
                        : "bg-slate-100 text-slate-500";
                const barPct = topConnected > 0 ? (a.connected / topConnected) * 100 : 0;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${rankCls}`}
                    >
                      {rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{a.name}</div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="badge badge-green tabular-nums">{a.connected}</span>
                      <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                        {a.attempts} attempt{a.attempts === 1 ? "" : "s"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lead pipeline */}
        <section className="panel lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title">Lead pipeline</h2>
            <span className="hint tabular-nums">{m.totals.leads} total</span>
          </div>
          {pipelineEntries.length === 0 ? (
            <EmptyState
              text="No leads yet"
              hint="Inbound leads will appear here as they move through routing."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pipelineEntries.map(({ status, count }) => {
                const meta = leadStatusMeta[status] ?? {
                  label: status.replace(/_/g, " ").toLowerCase(),
                  cls: "bg-slate-100 text-slate-600",
                };
                return (
                  <div
                    key={status}
                    className="rounded-xl border border-slate-200/80 p-3 transition hover:border-slate-300"
                  >
                    <div className="text-2xl font-semibold tabular-nums text-slate-900">
                      {count}
                    </div>
                    <div className="mt-1.5">
                      <Badge label={meta.label} cls={meta.cls} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Live pipeline activity preview (derived from leadStatus) */}
        <section className="panel">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title">In the pipeline</h2>
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {liveCount} active
              </span>
            )}
          </div>
          {liveCount === 0 ? (
            <EmptyState
              text="Pipeline is clear"
              hint="No leads are currently being validated, routed, or in progress."
            />
          ) : (
            <ul className="space-y-2">
              {LIVE_STATUS_ORDER.filter((s) => (m.leadStatus[s] ?? 0) > 0).map((status) => {
                const count = m.leadStatus[status] ?? 0;
                const meta = leadStatusMeta[status] ?? {
                  label: status.replace(/_/g, " ").toLowerCase(),
                  cls: "bg-slate-100 text-slate-600",
                };
                return (
                  <li
                    key={status}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2.5"
                  >
                    <Badge label={meta.label} cls={meta.cls} live={status === "IN_PROGRESS"} />
                    <span className="text-sm font-semibold tabular-nums text-slate-700">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
