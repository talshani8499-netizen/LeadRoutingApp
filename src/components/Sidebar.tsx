"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/dashboard/activity", label: "Live Calls", icon: "📞" },
  { href: "/dashboard/leads", label: "Leads", icon: "👤" },
  { href: "/dashboard/agents", label: "Agents", icon: "🎧" },
];

const settings = [
  { href: "/dashboard/settings/sources", label: "Lead Sources" },
  { href: "/dashboard/settings/rules", label: "Routing Rules" },
  { href: "/dashboard/settings/hours", label: "Business Hours" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-brand-600 text-white grid place-items-center font-bold">
            R
          </div>
          <div>
            <div className="font-semibold leading-tight">RouteDesk</div>
            <div className="text-[11px] text-slate-400 leading-tight">Lead Routing</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              isActive(item.href)
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Settings
        </div>
        {settings.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              isActive(item.href)
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="text-base w-5 text-center">⚙</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-slate-100 text-[11px] text-slate-400">
        Telephony: <span className="font-medium text-slate-600">Simulator</span>
      </div>
    </aside>
  );
}
