"use client";

import { useEffect, useRef, useState } from "react";

interface Source {
  id: string;
  name: string;
  label: string;
}

const SAMPLE_NAMES = [
  "Jordan Reyes",
  "Sam Carter",
  "Priya Nair",
  "Liam O'Brien",
  "Maya Cohen",
  "Diego Santos",
  "Nina Petrova",
  "Omar Haddad",
];

function randomPhone() {
  const n = Math.floor(1000000 + Math.random() * 8999999);
  return `+1202${n}`;
}

// A demo affordance: inject a synthetic inbound lead through the real webhook,
// exactly as a website form would. Triggers the whole routing + call flow.
export function SimulateLead({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/sources")
      .then((r) => r.json())
      .then((j) => setSources(j.sources ?? []))
      .catch(() => {});
    // Prefill with sample data for one-click demoing.
    setName(SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)]);
    setPhone(randomPhone());
    setMsg(null);
    // Move focus into the dialog and close on Escape.
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/webhook/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, source: source || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "Failed to create lead");
      } else {
        setMsg(
          json.routed
            ? "Lead received — routing & calling now."
            : `Lead received, but not routed: ${json.reason}`,
        );
        onCreated?.();
        setName(SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)]);
        setPhone(randomPhone());
      }
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <span className="text-base leading-none">＋</span> Simulate lead
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="simulate-lead-title"
        >
          <div
            className="card w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="simulate-lead-title" className="text-lg font-semibold">
                Simulate an inbound lead
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setOpen(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Posts to the real <code className="text-xs">/api/webhook/lead</code> endpoint,
              just like a website form would.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label" htmlFor="sim-name">Name</label>
                <input id="sim-name" ref={firstFieldRef} className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="sim-phone">Phone</label>
                <input id="sim-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="sim-source">Source</label>
                <select id="sim-source" className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Direct (no source)</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {msg && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                  {msg}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Close
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Sending…" : "Send lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
