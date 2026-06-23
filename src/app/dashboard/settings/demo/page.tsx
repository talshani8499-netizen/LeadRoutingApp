"use client";

import { useCallback, useEffect, useState } from "react";

interface Counts {
  leads: number;
  agents: number;
  attempts: number;
  total: number;
}

export default function DemoDataPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<null | "load" | "clear">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/demo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setCounts(j.counts);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function run(action: "load" | "clear") {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg({
          ok: false,
          text:
            j.error === "Internal error"
              ? "Failed — the demo columns may be missing on the database. Run db:push:prod, then retry."
              : (j.error ?? "Action failed"),
        });
      } else {
        setCounts(j.counts);
        setMsg({
          ok: true,
          text:
            action === "load"
              ? `Loaded ${j.counts.total} sample records. Open the Overview to see it populated.`
              : "Demo data cleared.",
        });
      }
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(null);
    }
  }

  const loaded = (counts?.total ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Demo data</h1>
          <p className="hint mt-1">
            Load realistic sample leads, agents and calls so you can see every dashboard field populated — then clear it
            in one click.
          </p>
        </div>
        <span className={`badge ${loaded ? "badge-green" : "badge-slate"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${loaded ? "bg-emerald-500" : "bg-slate-400"}`} />
          {loaded ? "Sample data loaded" : "No sample data"}
        </span>
      </div>

      {loadError && (
        <div className="panel border-red-200 bg-red-50 text-sm text-red-700" role="alert">
          Couldn&apos;t read demo-data status. If this persists, the demo columns may be missing on the database — run{" "}
          <code className="font-mono">npm run db:push:prod</code>.
        </div>
      )}

      <div className="panel">
        <h2 className="section-title">Status</h2>
        {!counts ? (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="h-16 skeleton" />
            <div className="h-16 skeleton" />
            <div className="h-16 skeleton" />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-4">
            {[
              { label: "Sample leads", value: counts.leads },
              { label: "Sample agents", value: counts.agents },
              { label: "Sample calls", value: counts.attempts },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-center">
                <div className="text-2xl font-semibold tabular-nums text-slate-900">{s.value}</div>
                <div className="hint mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={() => run("load")} disabled={busy !== null}>
            {busy === "load" ? "Loading…" : loaded ? "Reload demo data" : "Load demo data"}
          </button>
          <button className="btn-danger" onClick={() => run("clear")} disabled={busy !== null || !loaded}>
            {busy === "clear" ? "Clearing…" : "Clear demo data"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>
          )}
        </div>
      </div>

      <div className="panel">
        <h2 className="section-title mb-2">What gets added</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>6 sample agents (available / busy / offline) and 4 lead sources.</li>
          <li>~35 leads across the last few days, with connected / no-answer / busy / failed calls.</li>
          <li>A few live, in-progress calls so the <strong>Live Calls</strong> view animates.</li>
          <li>Matching activity-log entries for the feed.</li>
        </ul>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Every record is tagged as demo data and is removed by “Clear demo data” — your real leads, agents and calls are
          never touched.
        </div>
      </div>
    </div>
  );
}
