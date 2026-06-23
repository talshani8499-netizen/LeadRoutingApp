"use client";

import { useCallback, useEffect, useState } from "react";

interface Cfg {
  provider: "simulator" | "twilio";
  twilioAccountSid: string;
  twilioNumber: string;
  platformCallerId: string;
  publicBaseUrl: string;
  hasAuthToken: boolean;
  ready: boolean;
  source: "db" | "env";
}

type TestResult =
  | { ok: true; accountName: string; accountStatus: string; warnings: string[] }
  | { ok: false; error: string };

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="label">{label}</div>
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

export default function TelephonySettingsPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loadError, setLoadError] = useState(false);

  // form state
  const [provider, setProvider] = useState<"simulator" | "twilio">("simulator");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [number, setNumber] = useState("");
  const [callerId, setCallerId] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<TestResult | null>(null);

  const load = useCallback(() => {
    fetch("/api/telephony/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Cfg) => {
        setCfg(j);
        setProvider(j.provider);
        setAccountSid(j.twilioAccountSid);
        setNumber(j.twilioNumber);
        setCallerId(j.platformCallerId);
        setPublicBaseUrl(j.publicBaseUrl);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => load(), [load]);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    setTestMsg(null);
    try {
      const res = await fetch("/api/telephony/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          twilioAccountSid: accountSid,
          twilioAuthToken: authToken || undefined, // blank keeps the saved token
          twilioNumber: number,
          platformCallerId: callerId,
          publicBaseUrl,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSaveMsg({ ok: false, text: j.error ?? "Could not save settings" });
      } else {
        setSaveMsg({ ok: true, text: "Settings saved." });
        setAuthToken("");
        load();
      }
    } catch {
      setSaveMsg({ ok: false, text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/telephony/test", { method: "POST" });
      setTestMsg(await res.json());
    } catch {
      setTestMsg({ ok: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = (publicBaseUrl || origin).replace(/\/+$/, "");

  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Telephony</h1>
        <div className="panel border-red-200 bg-red-50 text-sm text-red-700" role="alert">
          Couldn&apos;t load telephony settings. Refresh to try again.
        </div>
      </div>
    );
  }

  if (!cfg) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 skeleton" />
        <div className="h-28 w-full skeleton" />
        <div className="h-64 w-full skeleton" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Telephony</h1>
          <p className="hint mt-1">Connect your own phone number to place real routed calls.</p>
        </div>
        <span className={`badge ${cfg.ready ? "badge-green" : "badge-amber"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.ready ? "bg-emerald-500" : "bg-amber-500"}`} />
          {cfg.provider === "twilio" ? (cfg.ready ? "Twilio connected" : "Twilio — setup incomplete") : "Simulator"}
        </span>
      </div>

      {/* Provider selector */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["simulator", "twilio"] as const).map((p) => {
          const active = provider === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={`card card-hover p-5 text-left transition ${
                active ? "ring-2 ring-brand-400 border-brand-300" : ""
              }`}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">
                  {p === "simulator" ? "Simulator" : "Twilio (real calls)"}
                </div>
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border ${
                    active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                  }`}
                  aria-hidden="true"
                >
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                      <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </div>
              <p className="hint mt-1.5">
                {p === "simulator"
                  ? "Drives the full flow with realistic timed outcomes. No credentials, no cost."
                  : "Places real PSTN calls from your Twilio number and bridges agent ↔ lead."}
              </p>
            </button>
          );
        })}
      </div>

      {/* Twilio credentials */}
      {provider === "twilio" && (
        <div className="panel space-y-4">
          <div>
            <h2 className="section-title">Twilio credentials</h2>
            <p className="hint mt-1">
              From your{" "}
              <a className="text-brand-600 hover:underline" href="https://console.twilio.com" target="_blank" rel="noreferrer">
                Twilio Console
              </a>{" "}
              → Account Info. The auth token is stored securely and never shown again.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="t-sid">Account SID</label>
              <input id="t-sid" className="input" placeholder="AC…" value={accountSid} onChange={(e) => setAccountSid(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="t-token">
                Auth Token {cfg.hasAuthToken && <span className="badge badge-green ml-1">saved</span>}
              </label>
              <input
                id="t-token"
                className="input"
                type="password"
                placeholder={cfg.hasAuthToken ? "•••••••• (leave blank to keep)" : "your auth token"}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="t-number">Twilio phone number</label>
              <input id="t-number" className="input" placeholder="+15551234567" value={number} onChange={(e) => setNumber(e.target.value)} />
              <p className="hint mt-1">E.164 format. This is the caller ID calls dial from.</p>
            </div>
            <div>
              <label className="label" htmlFor="t-caller">Caller ID (optional)</label>
              <input id="t-caller" className="input" placeholder="defaults to the number above" value={callerId} onChange={(e) => setCallerId(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="t-base">Public base URL</label>
              <input id="t-base" className="input" placeholder="https://your-app.vercel.app" value={publicBaseUrl} onChange={(e) => setPublicBaseUrl(e.target.value)} />
              <p className="hint mt-1">
                Public HTTPS origin Twilio can reach (no trailing slash). Must match exactly or callbacks are rejected.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {provider === "twilio" && (
          <button className="btn-ghost" onClick={test} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </button>
        )}
        {saveMsg && (
          <span className={`text-sm ${saveMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{saveMsg.text}</span>
        )}
      </div>

      {testMsg && (
        <div
          className={`panel text-sm ${testMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
          role="status"
        >
          {testMsg.ok ? (
            <>
              <div className="font-medium">✓ Connected to “{testMsg.accountName}” ({testMsg.accountStatus}).</div>
              {testMsg.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-700">
                  {testMsg.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <span>✕ {testMsg.error}</span>
          )}
        </div>
      )}

      {/* Webhook endpoints */}
      {provider === "twilio" && (
        <div className="panel space-y-4">
          <div>
            <h2 className="section-title">Webhook endpoints</h2>
            <p className="hint mt-1">
              The platform passes these to Twilio automatically per call. Make sure your number can dial out; no console
              webhook config is required.
            </p>
          </div>
          <div className="space-y-3">
            <CopyField label="Voice (TwiML)" value={`${base}/api/telephony/twilio/voice`} />
            <CopyField label="Status callback" value={`${base}/api/telephony/twilio/status`} />
            <CopyField label="Lead intake webhook (point your forms/ads here)" value={`${origin}/api/webhook/lead`} />
          </div>
        </div>
      )}

      {/* Setup checklist */}
      <div className="panel">
        <h2 className="section-title mb-3">Connect your number — checklist</h2>
        <ol className="space-y-2.5 text-sm text-slate-700">
          {[
            "Buy a number in Twilio, or port/verify your existing virtual number, with Voice enabled.",
            "Paste your Account SID, Auth Token and number above, set the Public base URL to this app's domain, choose Twilio, and Save.",
            "Click “Test connection” to confirm the credentials are valid.",
            "Add an Agent (Agents page) with a real, reachable phone number set to Available.",
            "Send a test lead — your agent rings first, then the lead, then they're bridged.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Security: before taking real leads, set a <code className="font-mono">LEAD_WEBHOOK_SECRET</code> and a Twilio
          spend limit so the public webhook can&apos;t be abused for toll fraud.
        </div>
      </div>
    </div>
  );
}
