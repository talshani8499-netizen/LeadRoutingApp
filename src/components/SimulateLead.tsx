"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    // Restore focus to the trigger for keyboard/SR users.
    triggerRef.current?.focus();
  }, []);

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

    // Lock background scroll while the dialog is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog.
    const t = setTimeout(() => firstFieldRef.current?.focus(), 0);

    // Escape to close + simple focus trap inside the dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [open, close]);

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
        setMsg({ kind: "err", text: json.error ?? "Failed to create lead" });
      } else if (json.routed) {
        setMsg({ kind: "ok", text: "Lead received — routing & calling now." });
        onCreated?.();
        setName(SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)]);
        setPhone(randomPhone());
      } else {
        setMsg({ kind: "warn", text: `Lead received, but not routed: ${json.reason}` });
        onCreated?.();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  const msgCls =
    msg?.kind === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : msg?.kind === "warn"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-red-50 border-red-200 text-red-700";

  return (
    <>
      <button ref={triggerRef} className="btn-primary" onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Simulate lead
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-labelledby="simulate-lead-title"
          >
            <div
              ref={dialogRef}
              className="card w-full max-w-md p-6 shadow-card-hover animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 id="simulate-lead-title" className="text-lg font-semibold text-slate-900">
                  Simulate an inbound lead
                </h3>
                <button
                  className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  onClick={close}
                  aria-label="Close dialog"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Posts to the real <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/api/webhook/lead</code>{" "}
                endpoint, just like a website form would.
              </p>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="label" htmlFor="sim-name">
                    Name
                  </label>
                  <input
                    id="sim-name"
                    ref={firstFieldRef}
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="sim-phone">
                    Phone
                  </label>
                  <input
                    id="sim-phone"
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="sim-source">
                    Source
                  </label>
                  <select
                    id="sim-source"
                    className="input"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Direct (no source)</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                {msg && (
                  <div className={`rounded-xl border px-3 py-2 text-sm ${msgCls}`} role="status">
                    {msg.text}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" className="btn-ghost" onClick={close}>
                    Close
                  </button>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {busy ? "Sending…" : "Send lead"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
