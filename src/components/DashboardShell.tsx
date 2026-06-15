"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, SidebarNav } from "@/components/Sidebar";
import { SimulateLead } from "@/components/SimulateLead";

// Client shell that owns the mobile-drawer state so phone/tablet users have
// real navigation (the desktop sidebar is hidden below md).
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on route change and on Escape.
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-white shadow-xl">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden btn-ghost px-2 py-1.5"
              aria-label="Open navigation menu"
              onClick={() => setMobileOpen(true)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div className="md:hidden font-semibold">RouteDesk</div>
            <div className="hidden md:block text-sm text-slate-400">
              Inbound lead routing &amp; instant call connect
            </div>
          </div>
          <SimulateLead />
        </header>
        <main className="flex-1 overflow-y-auto scroll-thin p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
