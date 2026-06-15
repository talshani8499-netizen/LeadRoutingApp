import { prisma } from "@/lib/db";
import { ACTIVE_CALL_STATES } from "@/lib/enums";

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
  const [
    leads,
    leadsToday,
    agents,
    agentsAvailable,
    activeCalls,
    outcomeGroups,
    statusGroups,
    talkAgg,
    attemptsByAgent,
    connectedByAgent,
    agentRows,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { createdAt: { gte: startOfToday() } } }),
    prisma.agent.count(),
    prisma.agent.count({ where: { status: "AVAILABLE", active: true } }),
    prisma.callAttempt.count({ where: { state: { in: ACTIVE_CALL_STATES } } }),
    prisma.callAttempt.groupBy({
      by: ["outcome"],
      _count: { _all: true },
      where: { outcome: { not: null } },
    }),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    // Average talk time computed in the DB (ignores null durations).
    prisma.callAttempt.aggregate({
      _avg: { durationSec: true },
      where: { outcome: "CONNECTED" },
    }),
    // Leaderboard via grouped counts rather than loading every attempt row.
    prisma.callAttempt.groupBy({ by: ["agentId"], _count: { _all: true } }),
    prisma.callAttempt.groupBy({
      by: ["agentId"],
      _count: { _all: true },
      where: { outcome: "CONNECTED" },
    }),
    prisma.agent.findMany({ select: { id: true, name: true } }),
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

  const avgTalkTimeSec = Math.round(talkAgg._avg.durationSec ?? 0);

  const leadStatus: Record<string, number> = {};
  for (const g of statusGroups) {
    leadStatus[g.status] = g._count._all;
  }

  const attemptCount = new Map(attemptsByAgent.map((g) => [g.agentId, g._count._all]));
  const connectedCount = new Map(connectedByAgent.map((g) => [g.agentId, g._count._all]));
  const agentLeaderboard = agentRows
    .map((a) => ({
      id: a.id,
      name: a.name,
      attempts: attemptCount.get(a.id) ?? 0,
      connected: connectedCount.get(a.id) ?? 0,
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
