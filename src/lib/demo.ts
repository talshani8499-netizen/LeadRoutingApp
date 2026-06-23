import { prisma } from "@/lib/db";

// Sample ("mock") data so the dashboard can be seen fully populated. Every row is
// marked isDemo:true, so it can be removed cleanly from Settings -> Demo Data
// without touching real records.

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rint = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a + 1));
const minutesAgo = (m: number): Date => new Date(Date.now() - m * 60_000);
const phone = (): string => `+1${rint(2010000000, 9899999999)}`;
const uid = (): string => globalThis.crypto.randomUUID();

const AGENTS = [
  { name: "Maya Cohen", status: "AVAILABLE", priority: 5, skills: "sales,enterprise" },
  { name: "Diego Santos", status: "AVAILABLE", priority: 3, skills: "support,billing" },
  { name: "Priya Nair", status: "BUSY", priority: 4, skills: "sales,spanish" },
  { name: "Liam O'Brien", status: "AVAILABLE", priority: 2, skills: "support" },
  { name: "Nina Petrova", status: "OFFLINE", priority: 1, skills: "enterprise" },
  { name: "Omar Haddad", status: "AVAILABLE", priority: 3, skills: "sales" },
];

const SOURCES = [
  { name: "demo-website", label: "Website", strategy: "ROUND_ROBIN" },
  { name: "demo-facebook", label: "Facebook Ads", strategy: "PRIORITY" },
  { name: "demo-google-ads", label: "Google Ads", strategy: "SKILL_BASED" },
  { name: "demo-referral", label: "Referral", strategy: "ROUND_ROBIN" },
];

const LEAD_NAMES = [
  "Jordan Reyes", "Sam Carter", "Ava Thompson", "Noah Kim", "Sofia Rossi",
  "Ethan Walker", "Isabella Núñez", "Lucas Meyer", "Mia Anderson", "Daniel Cohen",
  "Emma Dubois", "Yusuf Demir", "Olivia Brooks", "Mateo Silva", "Hannah Lee",
  "Caleb Foster", "Zoe Martin", "Aaron Klein", "Layla Hassan", "Ben Schwartz",
  "Grace O'Neil", "Ravi Patel", "Chloe Bauer", "Marcus Webb", "Elena Popova",
  "Tomás García", "Ruth Levi", "Felix Wagner", "Aisha Khan", "Leo Bianchi",
  "Sara Goldberg", "Nathan Price",
];

const OUTCOME_TO_STATUS: Record<string, string> = {
  CONNECTED: "CONNECTED",
  NO_ANSWER: "NO_ANSWER",
  BUSY: "BUSY",
  FAILED: "FAILED",
};

function weightedOutcome(): "CONNECTED" | "NO_ANSWER" | "BUSY" | "FAILED" {
  const r = Math.random();
  if (r < 0.6) return "CONNECTED";
  if (r < 0.8) return "NO_ANSWER";
  if (r < 0.9) return "BUSY";
  return "FAILED";
}

export interface DemoCounts {
  leads: number;
  agents: number;
  attempts: number;
  total: number;
}

export async function countDemo(): Promise<DemoCounts> {
  const [leads, agents, attempts] = await Promise.all([
    prisma.lead.count({ where: { isDemo: true } }),
    prisma.agent.count({ where: { isDemo: true } }),
    prisma.callAttempt.count({ where: { isDemo: true } }),
  ]);
  return { leads, agents, attempts, total: leads + agents + attempts };
}

const clearOps = () => [
  prisma.activityLog.deleteMany({ where: { isDemo: true } }),
  prisma.callAttempt.deleteMany({ where: { isDemo: true } }),
  prisma.lead.deleteMany({ where: { isDemo: true } }),
  prisma.agent.deleteMany({ where: { isDemo: true } }),
  prisma.leadSource.deleteMany({ where: { isDemo: true } }),
];

export async function clearDemoData(): Promise<void> {
  // FK-safe order: activity -> attempts -> leads -> agents -> sources.
  await prisma.$transaction(clearOps());
}

export async function loadDemoData(): Promise<DemoCounts> {
  const sources = SOURCES.map((s) => ({
    id: uid(),
    name: s.name,
    label: s.label,
    routingStrategy: s.strategy,
    enabled: true,
    isDemo: true,
  }));
  const agents = AGENTS.map((a) => ({
    id: uid(),
    name: a.name,
    phone: phone(),
    status: a.status,
    priority: a.priority,
    skills: a.skills,
    active: true,
    isDemo: true,
  }));

  const leads: Array<Record<string, unknown>> = [];
  const attempts: Array<Record<string, unknown>> = [];
  const activities: Array<Record<string, unknown>> = [];

  const pushActivity = (
    leadId: string,
    attemptId: string | null,
    type: string,
    message: string,
    at: Date,
  ) => {
    activities.push({ id: uid(), leadId, attemptId, type, message, createdAt: at, isDemo: true });
  };

  // Completed/attempted leads spread over the last 6 days (several today).
  const FINISHED = 30;
  for (let i = 0; i < FINISHED; i++) {
    const leadId = uid();
    const name = LEAD_NAMES[i % LEAD_NAMES.length];
    const source = pick(sources);
    // ~9 of them today; the rest across the previous 6 days.
    const baseMin = i < 9 ? rint(5, 720) : rint(1, 6) * 1440 + rint(0, 1200);
    const createdAt = minutesAgo(baseMin);

    const retry = Math.random() < 0.25; // some leads needed a 2nd agent
    const finalOutcome = weightedOutcome();

    leads.push({
      id: leadId,
      name,
      phone: phone(),
      email: `${name.split(" ")[0].toLowerCase()}@example.com`,
      status: OUTCOME_TO_STATUS[finalOutcome],
      sourceId: source.id,
      createdAt,
      isDemo: true,
    });
    pushActivity(leadId, null, "LEAD_RECEIVED", `New lead received: ${name} (${source.label})`, createdAt);

    let attemptNo = 0;
    if (retry) {
      // First attempt failed to connect, second one is the final outcome.
      attemptNo += 1;
      const a1 = uid();
      const firstAgent = pick(agents);
      const start1 = new Date(createdAt.getTime() + 20_000);
      const firstOutcome = Math.random() < 0.5 ? "NO_ANSWER" : "BUSY";
      attempts.push({
        id: a1, leadId, agentId: firstAgent.id, attemptNumber: attemptNo,
        state: firstOutcome, outcome: firstOutcome, startedAt: start1,
        endedAt: new Date(start1.getTime() + rint(8, 30) * 1000), isDemo: true,
      });
      pushActivity(leadId, a1, "AGENT_SELECTED", `Routing to ${firstAgent.name}`, start1);
    }

    attemptNo += 1;
    const agent = pick(agents);
    const attemptId = uid();
    const startedAt = new Date(createdAt.getTime() + (retry ? 70_000 : 25_000));
    const connected = finalOutcome === "CONNECTED";
    const bridgedAt = connected ? new Date(startedAt.getTime() + rint(4, 9) * 1000) : null;
    const durationSec = connected ? rint(45, 540) : null;
    const endedAt = connected
      ? new Date((bridgedAt as Date).getTime() + (durationSec as number) * 1000)
      : new Date(startedAt.getTime() + rint(8, 30) * 1000);

    attempts.push({
      id: attemptId, leadId, agentId: agent.id, attemptNumber: attemptNo,
      state: connected ? "COMPLETED" : finalOutcome, outcome: finalOutcome,
      startedAt, bridgedAt, endedAt, durationSec, isDemo: true,
    });
    pushActivity(leadId, attemptId, "AGENT_SELECTED", `Routing to ${agent.name}`, startedAt);
    pushActivity(leadId, attemptId, "CALL_PLACED", `Calling agent ${agent.name}…`, startedAt);
    if (connected) {
      pushActivity(leadId, attemptId, "CALL_COMPLETED", `Call connected (${durationSec}s)`, endedAt);
    } else {
      pushActivity(leadId, attemptId, "STATE_CHANGED", `Outcome: ${finalOutcome.replace("_", " ").toLowerCase()}`, endedAt);
    }
  }

  // A few brand-new leads (no attempt yet) to populate the pipeline.
  for (let i = 0; i < 5; i++) {
    const leadId = uid();
    const name = LEAD_NAMES[(FINISHED + i) % LEAD_NAMES.length];
    const source = pick(sources);
    const createdAt = minutesAgo(rint(1, 40));
    leads.push({
      id: leadId, name, phone: phone(),
      status: i % 2 === 0 ? "NEW" : "ROUTING", sourceId: source.id, createdAt, isDemo: true,
    });
    pushActivity(leadId, null, "LEAD_RECEIVED", `New lead received: ${name} (${source.label})`, createdAt);
  }

  // Live, in-progress calls so the Live Calls view + active count are populated.
  // No nextTransitionAt, so the simulator tick never touches these.
  const LIVE_STATES = ["AGENT_RINGING", "LEAD_RINGING", "BRIDGED"];
  for (let i = 0; i < 3; i++) {
    const leadId = uid();
    const name = LEAD_NAMES[(FINISHED + 5 + i) % LEAD_NAMES.length];
    const source = pick(sources);
    const agent = pick(agents);
    const createdAt = minutesAgo(rint(1, 4));
    const state = LIVE_STATES[i % LIVE_STATES.length];
    const attemptId = uid();
    leads.push({
      id: leadId, name, phone: phone(), status: "IN_PROGRESS",
      sourceId: source.id, createdAt, isDemo: true,
    });
    attempts.push({
      id: attemptId, leadId, agentId: agent.id, attemptNumber: 1, state,
      startedAt: createdAt, bridgedAt: state === "BRIDGED" ? minutesAgo(rint(0, 1)) : null,
      isDemo: true,
    });
    pushActivity(leadId, attemptId, "CALL_PLACED", `Calling agent ${agent.name}…`, createdAt);
  }

  await prisma.$transaction([
    ...clearOps(),
    prisma.leadSource.createMany({ data: sources }),
    prisma.agent.createMany({ data: agents }),
    prisma.lead.createMany({ data: leads as never }),
    prisma.callAttempt.createMany({ data: attempts as never }),
    prisma.activityLog.createMany({ data: activities as never }),
  ]);

  return countDemo();
}
