"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type IconName =
  | "overview"
  | "calls"
  | "leads"
  | "agents"
  | "sources"
  | "rules"
  | "hours"
  | "telephony";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "overview":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case "calls":
      return (
        <svg {...common}>
          <path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "leads":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 4a3 3 0 0 1 0 6M17.5 13.5A5.5 5.5 0 0 1 21 19" />
        </svg>
      );
    case "agents":
      return (
        <svg {...common}>
          <path d="M5 13v-1a7 7 0 0 1 14 0v1" />
          <rect x="3" y="13" width="4" height="6" rx="1.5" />
          <rect x="17" y="13" width="4" height="6" rx="1.5" />
          <path d="M19 19a3 3 0 0 1-3 3h-2" />
        </svg>
      );
    case "sources":
      return (
        <svg {...common}>
          <path d="M12 3v18M3 7.5h18M3 16.5h18" />
        </svg>
      );
    case "rules":
      return (
        <svg {...common}>
          <path d="M8 6h11M8 12h11M8 18h11" />
          <circle cx="4" cy="6" r="1.4" />
          <circle cx="4" cy="12" r="1.4" />
          <circle cx="4" cy="18" r="1.4" />
        </svg>
      );
    case "hours":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "telephony":
      return (
        <svg {...common}>
          <rect x="6" y="2.5" width="12" height="19" rx="3" />
          <path d="M11 18h2" />
        </svg>
      );
  }
}

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Overview", icon: "overview" },
  { href: "/dashboard/activity", label: "Live Calls", icon: "calls" },
  { href: "/dashboard/leads", label: "Leads", icon: "leads" },
  { href: "/dashboard/agents", label: "Agents", icon: "agents" },
];

const settings: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard/settings/telephony", label: "Telephony", icon: "telephony" },
  { href: "/dashboard/settings/sources", label: "Lead Sources", icon: "sources" },
  { href: "/dashboard/settings/rules", label: "Routing Rules", icon: "rules" },
  { href: "/dashboard/settings/hours", label: "Business Hours", icon: "hours" },
];

interface TelephonyStatus {
  provider: "simulator" | "twilio";
  ready: boolean;
  number?: string | null;
}

// Shared nav body, used by both the desktop sidebar and the mobile drawer.
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [tele, setTele] = useState<TelephonyStatus | null>(null);

  useEffect(() => {
    fetch("/api/telephony/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setTele(j))
      .catch(() => {});
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const linkCls = (href: string) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
      isActive(href)
        ? "bg-brand-50 text-brand-700"
        : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
    }`;

  const renderLink = (item: { href: string; label: string; icon: IconName }) => (
    <Link key={item.href} href={item.href} className={linkCls(item.href)} onClick={onNavigate}>
      {isActive(item.href) && (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" aria-hidden="true" />
      )}
      <span className={isActive(item.href) ? "text-brand-600" : "text-slate-400 group-hover:text-slate-500"}>
        <Icon name={item.icon} />
      </span>
      {item.label}
    </Link>
  );

  return (
    <>
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white grid place-items-center font-bold shadow-sm">
            R
          </div>
          <div>
            <div className="font-semibold leading-tight text-slate-900">RouteDesk</div>
            <div className="text-[11px] text-slate-400 leading-tight">Lead Routing</div>
          </div>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scroll-thin">
        {nav.map(renderLink)}

        <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Settings
        </div>
        {settings.map(renderLink)}
      </nav>

      <Link
        href="/dashboard/settings/telephony"
        onClick={onNavigate}
        className="mx-3 mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 transition hover:border-slate-200 hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="text-[11px] text-slate-400">Telephony</div>
          <div className="truncate text-sm font-medium text-slate-700">
            {tele ? (tele.provider === "twilio" ? "Twilio" : "Simulator") : "—"}
          </div>
        </div>
        <span
          className={`badge ${
            !tele ? "badge-slate" : tele.ready ? "badge-green" : "badge-amber"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              !tele ? "bg-slate-400" : tele.ready ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {!tele ? "…" : tele.ready ? "Live" : "Setup"}
        </span>
      </Link>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-slate-200 bg-white/90">
      <SidebarNav />
    </aside>
  );
}
