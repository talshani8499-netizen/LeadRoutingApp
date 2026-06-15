// Display helpers: human-friendly labels and Tailwind color classes for the
// various status/outcome enums. Centralized so badges look consistent.

export const leadStatusMeta: Record<string, { label: string; cls: string }> = {
  NEW: { label: "New", cls: "bg-slate-100 text-slate-600" },
  VALIDATING: { label: "Validating", cls: "bg-slate-100 text-slate-600" },
  ROUTING: { label: "Routing", cls: "bg-amber-100 text-amber-700" },
  IN_PROGRESS: { label: "In progress", cls: "bg-blue-100 text-blue-700" },
  CONNECTED: { label: "Connected", cls: "bg-emerald-100 text-emerald-700" },
  NO_ANSWER: { label: "No answer", cls: "bg-orange-100 text-orange-700" },
  BUSY: { label: "Busy", cls: "bg-yellow-100 text-yellow-800" },
  FAILED: { label: "Failed", cls: "bg-red-100 text-red-700" },
  NO_AGENT_AVAILABLE: { label: "No agent", cls: "bg-rose-100 text-rose-700" },
};

export const callStateMeta: Record<string, { label: string; cls: string; live?: boolean }> = {
  PENDING: { label: "Pending", cls: "bg-slate-100 text-slate-600", live: true },
  AGENT_RINGING: { label: "Calling agent", cls: "bg-amber-100 text-amber-700", live: true },
  AGENT_CONNECTED: { label: "Agent connected", cls: "bg-blue-100 text-blue-700", live: true },
  LEAD_RINGING: { label: "Calling lead", cls: "bg-indigo-100 text-indigo-700", live: true },
  BRIDGED: { label: "In conversation", cls: "bg-emerald-100 text-emerald-700", live: true },
  COMPLETED: { label: "Connected", cls: "bg-emerald-100 text-emerald-700" },
  NO_ANSWER: { label: "No answer", cls: "bg-orange-100 text-orange-700" },
  BUSY: { label: "Busy", cls: "bg-yellow-100 text-yellow-800" },
  FAILED: { label: "Failed", cls: "bg-red-100 text-red-700" },
  AGENT_NO_ANSWER: { label: "Agent no answer", cls: "bg-orange-100 text-orange-700" },
  CANCELLED: { label: "No agent", cls: "bg-rose-100 text-rose-700" },
};

export const agentStatusMeta: Record<string, { label: string; cls: string }> = {
  AVAILABLE: { label: "Available", cls: "bg-emerald-100 text-emerald-700" },
  BUSY: { label: "On a call", cls: "bg-blue-100 text-blue-700" },
  OFFLINE: { label: "Offline", cls: "bg-slate-100 text-slate-500" },
};

export const outcomeMeta: Record<string, { label: string; cls: string }> = {
  CONNECTED: { label: "Connected", cls: "bg-emerald-100 text-emerald-700" },
  NO_ANSWER: { label: "No answer", cls: "bg-orange-100 text-orange-700" },
  BUSY: { label: "Busy", cls: "bg-yellow-100 text-yellow-800" },
  FAILED: { label: "Failed", cls: "bg-red-100 text-red-700" },
};

export const strategyLabel: Record<string, string> = {
  ROUND_ROBIN: "Round robin",
  PRIORITY: "Priority",
  SKILL_BASED: "Skill based",
};

export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export function formatDuration(sec?: number | null): string {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
