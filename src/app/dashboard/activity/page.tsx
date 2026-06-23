"use client";

import { usePolling } from "@/lib/usePolling";
import { Badge } from "@/components/Badge";
import { StaleBanner } from "@/components/StaleBanner";
import { callStateMeta, outcomeMeta, formatDuration, timeAgo } from "@/lib/labels";

interface Attempt {
  id: string;
  state: string;
  outcome: string | null;
  attemptNumber: number;
  startedAt: string;
  durationSec: number | null;
  lead: { id: string; name: string; phone: string };
  agent: { id: string; name: string };
}

interface Resp {
  ok: boolean;
  active: Attempt[];
  recent: Attempt[];
}

// The visual call pipeline. Highlights how far a live attempt has progressed.
const STEPS = [
  { key: "agent", label: "Calling agent", states: ["AGENT_RINGING"] },
  { key: "agentOk", label: "Agent connected", states: ["AGENT_CONNECTED"] },
  { key: "lead", label: "Calling lead", states: ["LEAD_RINGING"] },
  { key: "bridged", label: "Connected", states: ["BRIDGED"] },
];

function stepIndex(state: string): number {
  if (state === "PENDING" || state === "AGENT_RINGING") return 0;
  if (state === "AGENT_CONNECTED") return 1;
  if (state === "LEAD_RINGING") return 2;
  if (state === "BRIDGED") return 3;
  return 3;
}

// Terminal/non-progressing states render the stepper in a muted "settled" tone
// rather than an in-progress glow.
function isLiveState(state: string): boolean {
  return callStateMeta[state]?.live ?? false;
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function CallCard({ a }: { a: Attempt }) {
  const meta = callStateMeta[a.state] ?? { label: a.state, cls: "bg-slate-100 text-slate-600" };
  const current = stepIndex(a.state);
  const live = isLiveState(a.state);
  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <PhoneIcon />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{a.lead.name}</div>
            <div className="truncate text-xs text-slate-400">{a.lead.phone}</div>
          </div>
        </div>
        <Badge label={meta.label} cls={meta.cls} live={meta.live} />
      </div>

      <div className="mt-5 flex items-start gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <div key={s.key} className="flex-1">
              <div className="flex items-center">
                <span
                  className={`grid h-2.5 w-2.5 place-items-center rounded-full transition-colors ${
                    done
                      ? "bg-brand-500"
                      : isCurrent && live
                        ? "pulse-dot bg-brand-500 text-brand-500"
                        : isCurrent
                          ? "bg-brand-400"
                          : "bg-slate-200"
                  }`}
                />
                {i < STEPS.length - 1 && (
                  <span
                    className={`ml-1.5 h-0.5 flex-1 rounded-full transition-colors ${
                      done ? "bg-brand-500" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
              <div
                className={`mt-2 text-[10px] leading-tight ${
                  i < current
                    ? "text-slate-500"
                    : isCurrent
                      ? "font-medium text-brand-600"
                      : "text-slate-300"
                }`}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
        <span>
          Agent: <span className="font-medium text-slate-600">{a.agent.name}</span>
        </span>
        <span className="flex items-center gap-2">
          {a.attemptNumber > 1 && (
            <span className="badge badge-amber">attempt #{a.attemptNumber}</span>
          )}
          <span>{timeAgo(a.startedAt)}</span>
        </span>
      </div>
    </div>
  );
}

function CallCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className="skeleton h-9 w-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      </div>
      <div className="skeleton mt-6 h-2.5 w-full rounded-full" />
      <div className="skeleton mt-5 h-3 w-full" />
    </div>
  );
}

export default function ActivityPage() {
  // 1.5s poll: also advances the simulator on each tick.
  const { data, loading, error, lastUpdated } = usePolling<Resp>("/api/calls/active", 1500);
  const active = data?.active ?? [];
  const recent = data?.recent ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Live Calls</h1>
          <p className="hint mt-1">
            Agent-first dialing, in real time. Watching this page drives the simulator forward.
          </p>
        </div>
        <div>
          {active.length > 0 ? (
            <span className="badge badge-green">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 text-emerald-500" />
              {active.length} active {active.length === 1 ? "call" : "calls"}
            </span>
          ) : (
            <span className="badge badge-slate">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Idle
            </span>
          )}
        </div>
      </div>

      <StaleBanner error={error} lastUpdated={lastUpdated} />

      <section className="space-y-3">
        <h2 className="section-title">Active pipeline</h2>
        {loading && !data ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CallCardSkeleton key={i} />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-300">
              <PhoneIcon />
            </span>
            <div className="mt-4 font-medium text-slate-700">No active calls</div>
            <div className="mt-1 max-w-sm text-sm text-slate-400">
              Click “Simulate lead” in the top bar to route a lead and watch the pipeline connect.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((a) => (
              <CallCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Recent outcomes</h2>
        {loading && !data ? (
          <div className="card divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-40" />
                  <div className="skeleton h-3 w-24" />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="card px-6 py-8 text-center text-sm text-slate-400">
            No completed calls yet.
          </div>
        ) : (
          <div className="card overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="t-head px-5 py-3">Lead</th>
                  <th className="t-head px-5 py-3 hidden sm:table-cell">Agent</th>
                  <th className="t-head px-5 py-3">Outcome</th>
                  <th className="t-head px-5 py-3 hidden md:table-cell">Duration</th>
                  <th className="t-head px-5 py-3 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => {
                  const om = a.outcome ? outcomeMeta[a.outcome] : null;
                  const sm = callStateMeta[a.state];
                  return (
                    <tr key={a.id} className="t-row hover:bg-slate-50/60">
                      <td className="t-cell px-5">
                        <div className="font-medium text-slate-900">{a.lead.name}</div>
                        <div className="text-xs text-slate-400">{a.lead.phone}</div>
                      </td>
                      <td className="t-cell px-5 hidden sm:table-cell text-slate-500">
                        {a.agent.name}
                      </td>
                      <td className="t-cell px-5">
                        {om ? (
                          <Badge label={om.label} cls={om.cls} />
                        ) : (
                          <Badge label={sm?.label ?? a.state} cls={sm?.cls ?? "bg-slate-100 text-slate-600"} />
                        )}
                      </td>
                      <td className="t-cell px-5 hidden md:table-cell text-slate-500">
                        {formatDuration(a.durationSec)}
                      </td>
                      <td className="t-cell px-5 text-right text-xs text-slate-400">
                        {timeAgo(a.startedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
