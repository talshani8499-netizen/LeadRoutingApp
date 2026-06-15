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

function CallCard({ a }: { a: Attempt }) {
  const meta = callStateMeta[a.state] ?? { label: a.state, cls: "bg-slate-100 text-slate-600" };
  const current = stepIndex(a.state);
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{a.lead.name}</div>
          <div className="text-xs text-slate-400">{a.lead.phone}</div>
        </div>
        <Badge label={meta.label} cls={meta.cls} live={meta.live} />
      </div>

      <div className="mt-4 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-all ${
                i < current
                  ? "bg-brand-500"
                  : i === current
                    ? "bg-brand-400 animate-pulse"
                    : "bg-slate-200"
              }`}
            />
            <div
              className={`mt-1.5 text-[10px] ${
                i <= current ? "text-slate-600" : "text-slate-300"
              }`}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>
          Agent: <span className="text-slate-600 font-medium">{a.agent.name}</span>
        </span>
        <span>
          {a.attemptNumber > 1 && (
            <span className="text-orange-500 mr-2">attempt #{a.attemptNumber}</span>
          )}
          {timeAgo(a.startedAt)}
        </span>
      </div>
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Calls</h1>
          <p className="text-sm text-slate-500">
            Agent-first dialing, in real time. Watching this page drives the simulator forward.
          </p>
        </div>
        {active.length > 0 && (
          <span className="inline-flex items-center gap-2 text-sm text-emerald-600 font-medium">
            <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {active.length} active
          </span>
        )}
      </div>

      <StaleBanner error={error} lastUpdated={lastUpdated} />

      {loading && !data ? (
        <div className="text-slate-400">Loading…</div>
      ) : active.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📞</div>
          <div className="font-medium">No active calls</div>
          <div className="text-sm text-slate-400 mt-1">
            Click “Simulate lead” in the top bar to route a lead and watch the call connect.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {active.map((a) => (
            <CallCard key={a.id} a={a} />
          ))}
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3 mt-2">Recent calls</h2>
        {recent.length === 0 ? (
          <div className="text-sm text-slate-400">No completed calls yet.</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {recent.map((a) => {
              const om = a.outcome ? outcomeMeta[a.outcome] : null;
              const sm = callStateMeta[a.state];
              return (
                <div key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{a.lead.name}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {a.agent.name} · {a.lead.phone}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{formatDuration(a.durationSec)}</span>
                  {om ? (
                    <Badge label={om.label} cls={om.cls} />
                  ) : (
                    <Badge label={sm?.label ?? a.state} cls={sm?.cls ?? "bg-slate-100"} />
                  )}
                  <span className="text-xs text-slate-400 w-16 text-right">
                    {timeAgo(a.startedAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
