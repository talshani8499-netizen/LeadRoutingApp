"use client";

import { useCallback, useEffect, useState } from "react";

type Canonical = "name" | "phone" | "email" | "source" | "notes" | "externalId";
const CANONICAL: Canonical[] = ["name", "phone", "email", "source", "notes", "externalId"];

interface Cfg {
  defaultSource: string;
  fieldMap: Record<string, Canonical>;
  builtInAliases: Record<Canonical, string[]>;
  secretRequired: boolean;
  webhookPath: string;
}

interface DryResult {
  ok: boolean;
  mode: string;
  raw: Record<string, unknown>;
  mapped: Partial<Record<Canonical, string>>;
  validation: { ok: boolean; errors?: Record<string, string[]> };
  routingPreview: null | {
    wouldRoute: boolean;
    reason: string;
    strategy: string;
    businessOpen: boolean;
    sourceEnabled: boolean;
    eligibleCount: number;
    agent: { id: string; name: string } | null;
  };
  lead?: { id: string; routed: boolean; reason: string; attemptId?: string };
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {value}
        </code>
        <button
          type="button"
          className="btn-ghost btn-sm shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard may be blocked */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  "agent-selected": "Would route to an agent",
  "no-eligible-agent": "No available/eligible agent right now",
  "outside-business-hours": "Outside business hours",
  holiday: "Closed for a holiday",
  "source-disabled": "This lead source is disabled",
};

export default function ConnectFormsPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [defaultSource, setDefaultSource] = useState("");
  const [rows, setRows] = useState<{ field: string; canon: Canonical }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [platform, setPlatform] = useState("zapier");

  // Test console — key/value rows so the user can mimic their form's field names.
  const [testRows, setTestRows] = useState<{ key: string; value: string }[]>([
    { key: "full_name", value: "Jamie Rivera" },
    { key: "phone_number", value: "202-555-0142" },
    { key: "your-email", value: "jamie@example.com" },
    { key: "message", value: "Requesting a callback about pricing" },
  ]);
  const [busy, setBusy] = useState<null | "dry" | "live">(null);
  const [result, setResult] = useState<DryResult | null>(null);

  const [recent, setRecent] = useState<
    { id: string; name: string; status: string; source?: { label: string } | null }[]
  >([]);

  const load = useCallback(() => {
    fetch("/api/forms/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Cfg) => {
        setCfg(j);
        setDefaultSource(j.defaultSource);
        setRows(Object.entries(j.fieldMap).map(([field, canon]) => ({ field, canon })));
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
    fetch("/api/leads")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setRecent((j.leads ?? []).slice(0, 8)))
      .catch(() => {});
  }, []);

  useEffect(() => load(), [load]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = cfg ? `${origin}${cfg.webhookPath}` : "";
  const webhookUrlWithToken = cfg?.secretRequired ? `${webhookUrl}?token=YOUR_SECRET` : webhookUrl;

  async function saveConfig() {
    setSaving(true);
    setSaveMsg(null);
    const fieldMap: Record<string, Canonical> = {};
    for (const r of rows) if (r.field.trim()) fieldMap[r.field.trim()] = r.canon;
    try {
      const res = await fetch("/api/forms/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultSource: defaultSource || undefined, fieldMap }),
      });
      setSaveMsg(res.ok ? "Saved." : "Could not save.");
      if (res.ok) load();
    } catch {
      setSaveMsg("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function runTest(mode: "dry" | "live") {
    setBusy(mode);
    setResult(null);
    const fields: Record<string, string> = {};
    for (const r of testRows) if (r.key.trim()) fields[r.key.trim()] = r.value;
    try {
      const res = await fetch("/api/forms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, fields }),
      });
      setResult(await res.json());
      if (mode === "live") load();
    } catch {
      setResult({
        ok: false,
        mode,
        raw: {},
        mapped: {},
        validation: { ok: false, errors: { _: ["Network error"] } },
        routingPreview: null,
      });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Connect Forms</h1>
        <div className="panel border-red-200 bg-red-50 text-sm text-red-700" role="alert">
          Couldn&apos;t load form settings. If this persists, the config table may be missing — run{" "}
          <code className="font-mono">npm run db:push:prod</code>.
        </div>
      </div>
    );
  }
  if (!cfg) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 skeleton" />
        <div className="h-28 w-full skeleton" />
        <div className="h-64 w-full skeleton" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Connect Forms</h1>
        <p className="hint mt-1">
          Send leads from any form — Zapier, Meta Lead Ads, Typeform, Jotform, WordPress or a plain HTML form — to your
          webhook, then test that they reach routing.
        </p>
      </div>

      {/* 1. Webhook endpoint */}
      <div className="panel space-y-4">
        <div>
          <h2 className="section-title">Your webhook endpoint</h2>
          <p className="hint mt-1">
            Point your form tool here. Accepts JSON, <code>x-www-form-urlencoded</code> and{" "}
            <code>multipart/form-data</code>.
          </p>
        </div>
        <CopyField label="Webhook URL" value={webhookUrlWithToken} />
        {cfg.secretRequired ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A secret is set — replace <code className="font-mono">YOUR_SECRET</code> with your{" "}
            <code className="font-mono">LEAD_WEBHOOK_SECRET</code> (or send it as an{" "}
            <code className="font-mono">x-webhook-secret</code> header).
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No secret is set. For production, set <code className="font-mono">LEAD_WEBHOOK_SECRET</code> and append{" "}
            <code className="font-mono">?token=…</code> so the public endpoint can&apos;t be abused.
          </div>
        )}
      </div>

      {/* 2. Default source + field mapping */}
      <div className="panel space-y-4">
        <div>
          <h2 className="section-title">Field mapping</h2>
          <p className="hint mt-1">
            We auto-detect common field names. Add custom mappings for any field your form sends under an unusual name.
          </p>
        </div>

        <div className="max-w-sm">
          <label className="label" htmlFor="default-source">
            Default source label
          </label>
          <input
            id="default-source"
            className="input"
            placeholder="e.g. Website Form"
            value={defaultSource}
            onChange={(e) => setDefaultSource(e.target.value)}
          />
          <p className="hint mt-1">Applied when a submission doesn&apos;t include a source field.</p>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="their field name (e.g. Q3_phone)"
                value={row.field}
                onChange={(e) =>
                  setRows((rs) => rs.map((r, j) => (j === i ? { ...r, field: e.target.value } : r)))
                }
                aria-label="Incoming field name"
              />
              <span className="text-slate-400" aria-hidden="true">
                →
              </span>
              <select
                className="input w-40"
                value={row.canon}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) => (j === i ? { ...r, canon: e.target.value as Canonical } : r)),
                  )
                }
                aria-label="Maps to canonical field"
              >
                {CANONICAL.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost btn-sm shrink-0"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                aria-label="Remove mapping"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setRows((rs) => [...rs, { field: "", canon: "name" }])}
          >
            + Add mapping
          </button>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-600">
          <div className="mb-1 font-medium text-slate-700">Auto-detected aliases</div>
          <div className="grid gap-1 sm:grid-cols-2">
            {CANONICAL.map((c) => (
              <div key={c}>
                <span className="font-medium text-slate-700">{c}</span>: {cfg.builtInAliases[c].slice(0, 6).join(", ")}
                {c === "name" ? ", first_name + last_name" : ""}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={saveConfig} disabled={saving}>
            {saving ? "Saving…" : "Save mapping"}
          </button>
          {saveMsg && <span className="text-sm text-slate-500">{saveMsg}</span>}
        </div>
      </div>

      {/* 3. Platform setup guides */}
      <div className="panel space-y-4">
        <h2 className="section-title">Setup guide</h2>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPlatform(p.key)}
              className={`badge ${platform === p.key ? "badge-blue" : "badge-slate"} cursor-pointer`}
              aria-pressed={platform === p.key}
            >
              {p.name}
            </button>
          ))}
        </div>
        <PlatformGuide platformKey={platform} webhookUrl={webhookUrlWithToken} />
      </div>

      {/* 4. Test console */}
      <div className="panel space-y-4">
        <div>
          <h2 className="section-title">Test your form</h2>
          <p className="hint mt-1">
            Enter fields exactly as your form sends them (rename the keys to match), then run a dry test to see how they
            map and where they&apos;d route — no lead created.
          </p>
        </div>

        <div className="space-y-2">
          {testRows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input w-1/3"
                placeholder="field name"
                value={row.key}
                onChange={(e) =>
                  setTestRows((rs) => rs.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))
                }
                aria-label="Test field name"
              />
              <input
                className="input flex-1"
                placeholder="value"
                value={row.value}
                onChange={(e) =>
                  setTestRows((rs) => rs.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                }
                aria-label="Test field value"
              />
              <button
                type="button"
                className="btn-ghost btn-sm shrink-0"
                onClick={() => setTestRows((rs) => rs.filter((_, j) => j !== i))}
                aria-label="Remove field"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setTestRows((rs) => [...rs, { key: "", value: "" }])}
          >
            + Add field
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={() => runTest("dry")} disabled={busy !== null}>
            {busy === "dry" ? "Testing…" : "Test mapping (dry run)"}
          </button>
          <button className="btn-ghost" onClick={() => runTest("live")} disabled={busy !== null}>
            {busy === "live" ? "Sending…" : "Send real test lead"}
          </button>
          <span className="hint">“Send real” creates a lead and routes it (places a real call in Twilio mode).</span>
        </div>

        {result && <TestResult result={result} />}
      </div>

      {/* 5. Recent submissions */}
      <div className="panel">
        <h2 className="section-title mb-3">Recent submissions</h2>
        {recent.length === 0 ? (
          <p className="hint">No leads yet — run a test above or submit your connected form.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="t-head px-3 py-2">Lead</th>
                  <th className="t-head px-3 py-2">Source</th>
                  <th className="t-head px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((l) => (
                  <tr key={l.id} className="t-row">
                    <td className="t-cell">{l.name}</td>
                    <td className="t-cell">
                      <span className="badge badge-slate">{l.source?.label ?? "Direct"}</span>
                    </td>
                    <td className="t-cell">
                      <span className="badge badge-slate">{l.status.replace(/_/g, " ").toLowerCase()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TestResult({ result }: { result: DryResult }) {
  const v = result.validation;
  const p = result.routingPreview;
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      {/* Mapping */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Mapped fields</div>
        {Object.keys(result.mapped).length === 0 ? (
          <div className="text-sm text-slate-500">Nothing mapped from those fields.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.mapped).map(([k, val]) => (
              <span key={k} className="badge badge-blue">
                {k}: <span className="font-normal">{String(val)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Validation */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Validation</div>
        {v.ok ? (
          <span className="badge badge-green">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Valid
          </span>
        ) : (
          <div className="space-y-1">
            <span className="badge badge-red">Invalid</span>
            <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
              {Object.entries(v.errors ?? {}).map(([field, msgs]) => (
                <li key={field}>
                  <span className="font-medium">{field}</span>: {(msgs as string[]).join(", ")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Routing */}
      {v.ok && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Routing</div>
          {result.lead ? (
            <div className="text-sm">
              <span className={`badge ${result.lead.routed ? "badge-green" : "badge-amber"}`}>
                {result.lead.routed ? "Routed & calling" : `Not routed: ${result.lead.reason}`}
              </span>
              <span className="hint ml-2">
                Lead created — see{" "}
                <a className="text-brand-600 hover:underline" href="/dashboard/activity">
                  Live Calls
                </a>
                .
              </span>
            </div>
          ) : p ? (
            <div className="text-sm text-slate-700">
              <span className={`badge ${p.wouldRoute ? "badge-green" : "badge-amber"}`}>
                {REASON_LABEL[p.reason] ?? p.reason}
              </span>
              {p.agent && <span className="ml-2">→ {p.agent.name}</span>}
              <div className="hint mt-1">
                business {p.businessOpen ? "open" : "closed"} · strategy {p.strategy.toLowerCase()} · {p.eligibleCount}{" "}
                eligible agent{p.eligibleCount === 1 ? "" : "s"}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform guides
// ---------------------------------------------------------------------------
const PLATFORMS = [
  { key: "zapier", name: "Zapier / Make" },
  { key: "meta", name: "Meta Lead Ads" },
  { key: "typeform", name: "Typeform" },
  { key: "jotform", name: "Jotform" },
  { key: "wordpress", name: "WordPress" },
  { key: "html", name: "Plain HTML" },
  { key: "other", name: "Webflow / Wix / Squarespace" },
];

function PlatformGuide({ platformKey, webhookUrl }: { platformKey: string; webhookUrl: string }) {
  const guides: Record<string, string[]> = {
    zapier: [
      "Create a Zap/Scenario with your form (or Meta Lead Ads) as the trigger.",
      "Add a “Webhooks — POST” action.",
      `Set the URL to your webhook URL above.`,
      "Map the form fields to keys like name, phone, email (or any names — we auto-detect and you can add custom mappings).",
      "Turn it on and submit a test — then use the Test panel below to confirm routing.",
    ],
    meta: [
      "Meta delivers leads to its own webhook, so relay through Zapier or Make (recommended): trigger = “Facebook/Meta Lead Ads — New Lead”.",
      "Add a “Webhooks — POST” action pointing at your webhook URL.",
      "Map full name / phone / email (Meta’s field names are handled by our aliases).",
      "Publish, then use Meta’s Lead Ads Testing Tool to send a test lead.",
    ],
    typeform: [
      "In Typeform open your form → Connect → Webhooks.",
      "Add your webhook URL and enable it.",
      "If your Typeform is highly nested, relay via Zapier/Make instead for clean fields.",
      "Submit a test response and confirm it lands in Recent submissions.",
    ],
    jotform: [
      "In Jotform open your form → Settings → Integrations → Webhooks.",
      "Paste your webhook URL and complete the integration.",
      "Jotform posts form-encoded data — field names are auto-detected.",
      "Submit a test and confirm below.",
    ],
    wordpress: [
      "Install a webhook add-on: WPForms Webhooks, Gravity Forms Webhooks, or Ninja Forms Webhooks (Contact Form 7: use the CF7-to-Webhook plugin).",
      "Add a webhook/feed with Request Method = POST and Request URL = your webhook URL.",
      "Map the form fields (name/phone/email) — arbitrary names are auto-detected.",
      "Submit a test entry and confirm routing below.",
    ],
    html: [
      "Point your form’s action at the webhook URL with method POST.",
      "Name the inputs name / phone / email (or anything — aliases handle it).",
      "Copy the snippet below to get started.",
    ],
    other: [
      "Webflow: Site settings → Integrations → add a form webhook (or use Make/Zapier).",
      "Wix / Squarespace: use their automations or a Zapier/Make relay with a “Webhooks — POST”.",
      "Point it at your webhook URL and map name/phone/email.",
      "Submit a test and confirm below.",
    ],
  };
  const steps = guides[platformKey] ?? [];
  const htmlSnippet = `<form action="${webhookUrl}" method="POST">
  <input name="name" placeholder="Full name" required />
  <input name="phone" placeholder="Phone" required />
  <input name="email" placeholder="Email" />
  <input type="hidden" name="source" value="Website" />
  <button type="submit">Request a call</button>
</form>`;
  const curl = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  --data "full_name=Jane Roe&phone_number=2025550123&your-email=jane@example.com&form_name=Website"`;

  return (
    <div className="space-y-3">
      <ol className="space-y-2 text-sm text-slate-700">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {platformKey === "html" && (
        <div>
          <div className="label">Copy-paste HTML form</div>
          <pre className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
            {htmlSnippet}
          </pre>
        </div>
      )}
      <div>
        <div className="label">Or test from your terminal</div>
        <pre className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
          {curl}
        </pre>
      </div>
    </div>
  );
}
