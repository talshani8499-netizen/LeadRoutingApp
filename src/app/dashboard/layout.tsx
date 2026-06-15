import { Sidebar } from "@/components/Sidebar";
import { SimulateLead } from "@/components/SimulateLead";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur flex items-center justify-between px-6">
          <div className="md:hidden font-semibold">RouteDesk</div>
          <div className="hidden md:block text-sm text-slate-400">
            Inbound lead routing &amp; instant call connect
          </div>
          <SimulateLead />
        </header>
        <main className="flex-1 overflow-y-auto scroll-thin p-6">{children}</main>
      </div>
    </div>
  );
}
