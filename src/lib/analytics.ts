import { prisma } from "@/lib/db";

// Dashboard aggregations. Kept as a single module so the overview page and the
// /api/analytics route share one source of truth.

export interface DashboardMetrics {
  totals: {
    leads: number;
    leadsToday: number;
    agents: number;
    agentsAvailable: number;
    activeCalls: number;
  };
  outcomes: {
    CONNECTED: number;
    NO_ANSWER: number;
    BUSY: number;
    FAILED: number;
  };
  connectRate: number; // 0..1 over completed attempts
  avgTalkTimeSec: number;
  leadStatus: Record<string, number>;
  agentLeaderboard: Array<{
    id: string;
    name: string;
    connected: number;
    attempts: number;
  }>;
}

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const ACTIVE_STATES = [
    "PENDING",
    "AGENT_RINGING",
    "AGENT_CONNECTED",
    "LEAD_RINGING",
    "BRIDGED",
  ] as const;

  const [
    leads,
    leadsToday,
    agents,
    agentsAvailable,
    activeCalls,
    outcomeGroups,
    statusGroups,
    connectedAttempts,
    agentsWithAttempts,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { createdAt: { gte: startOfToday() } } }),
    prisma.agent.count(),
    prisma.agent.count({ where: { status: "AVAILABLE", active: true } }),
    prisma.callAttempt.count({ where: { state: { in: [...ACTIVE_STATES] } } }),
    prisma.callAttempt.groupBy({
      by: ["outcome"],
      _count: { _all: true },
      where: { outcome: { not: null } },
    }),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.callAttempt.findMany({
      where: { outcome: "CONNECTED" },
      select: { durationSec: true },
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        attempts: { select: { outcome: true } },
      },
    }),
  ]);

  const outcomes = { CONNECTED: 0, NO_ANSWER: 0, BUSY: 0, FAILED: 0 };
  for (const g of outcomeGroups) {
    if (g.outcome && g.outcome in outcomes) {
      outcomes[g.outcome as keyof typeof outcomes] = g._count._all;
    }
  }

  const totalOutcomes =
    outcomes.CONNECTED + outcomes.NO_ANSWER + outcomes.BUSY + outcomes.FAILED;
  const connectRate = totalOutcomes > 0 ? outcomes.CONNECTED / totalOutcomes : 0;

  const talkTimes = connectedAttempts
    .map((a) => a.durationSec ?? 0)
    .filter((n) => n > 0);
  const avgTalkTimeSec =
    talkTimes.length > 0
      ? Math.round(talkTimes.reduce((s, n) => s + n, 0) / talkTimes.length)
      : 0;

  const leadStatus: Record<string, number> = {};
  for (const g of statusGroups) {
    leadStatus[g.status] = g._count._all;
  }

  const agentLeaderboard = agentsWithAttempts
    .map((a) => ({
      id: a.id,
      name: a.name,
      attempts: a.attempts.length,
      connected: a.attempts.filter((t) => t.outcome === "CONNECTED").length,
    }))
    .sort((a, b) => b.connected - a.connected || b.attempts - a.attempts)
    .slice(0, 8);

  return {
    totals: {
      leads,
      leadsToday,
      agents,
      agentsAvailable,
      activeCalls,
    },
    outcomes,
    connectRate,
    avgTalkTimeSec,
    leadStatus,
    agentLeaderboard,
  };
}
