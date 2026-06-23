import type { Agent } from "@prisma/client";
import type { RoutingStrategy } from "@/lib/enums";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { logger, maskPhone } from "@/lib/logger";
import { getTelephony } from "@/lib/telephony";
import { isHoliday, isWithinBusinessHours } from "./businessHours";

export interface RoutingDecision {
  agent: Agent | null;
  reason: string; // machine-ish reason, also written to the activity log
  strategy: RoutingStrategy;
  maxAttempts: number;
}

export interface StartAttemptOptions {
  excludeAgentIds?: string[];
  attemptNumber?: number;
}

export interface StartAttemptResult {
  ok: boolean;
  attemptId?: string;
  reason: string;
}

/** Does an agent's CSV skill list contain the required skill? */
function hasSkill(agent: Agent, skill: string | null | undefined): boolean {
  if (!skill) return true;
  const skills = agent.skills
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return skills.includes(skill.trim().toLowerCase());
}

/** Pick a single agent from eligible candidates per the chosen strategy. */
export function pickAgent(strategy: RoutingStrategy, agents: Agent[]): Agent | null {
  if (agents.length === 0) return null;
  const byRoundRobin = [...agents].sort((a, b) => {
    const at = a.lastRoutedAt ? a.lastRoutedAt.getTime() : 0;
    const bt = b.lastRoutedAt ? b.lastRoutedAt.getTime() : 0;
    return at - bt; // oldest (or never-routed) first
  });

  switch (strategy) {
    case "PRIORITY":
      return [...agents].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const at = a.lastRoutedAt ? a.lastRoutedAt.getTime() : 0;
        const bt = b.lastRoutedAt ? b.lastRoutedAt.getTime() : 0;
        return at - bt;
      })[0];
    case "SKILL_BASED":
    case "ROUND_ROBIN":
    default:
      return byRoundRobin[0];
  }
}

/**
 * Evaluate all business rules and select the most appropriate available agent.
 * This is the heart of step 4–5 of the flow.
 */
export async function routeLead(
  leadId: string,
  opts: StartAttemptOptions = {},
): Promise<RoutingDecision> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { source: true },
  });
  if (!lead) {
    return { agent: null, reason: "lead-not-found", strategy: "ROUND_ROBIN", maxAttempts: 1 };
  }

  // 1) Business hours — holidays first, then the weekly schedule.
  const now = new Date();
  const hours = await prisma.businessHours.findMany();
  const businessTz = hours[0]?.timezone ?? "UTC";
  const holidays = await prisma.holiday.findMany();
  const holidayCheck = isHoliday(now, holidays, businessTz);
  if (holidayCheck.holiday) {
    return { agent: null, reason: "holiday", strategy: "ROUND_ROBIN", maxAttempts: 1 };
  }
  const hoursCheck = isWithinBusinessHours(now, hours);
  if (!hoursCheck.open) {
    return { agent: null, reason: "outside-business-hours", strategy: "ROUND_ROBIN", maxAttempts: 1 };
  }

  // 2) Lead source settings — a disabled source is not routed
  if (lead.source && !lead.source.enabled) {
    return { agent: null, reason: "source-disabled", strategy: "ROUND_ROBIN", maxAttempts: 1 };
  }

  // Defaults derived from the source, overridable by a routing rule.
  let strategy: RoutingStrategy =
    (lead.source?.routingStrategy as RoutingStrategy) ?? "ROUND_ROBIN";
  let requiredSkill: string | null = lead.source?.requiredSkill ?? null;
  let maxAttempts = 3;

  // 3) Routing rule — first enabled rule matching this source (or wildcard)
  const rules = await prisma.routingRule.findMany({
    where: { enabled: true },
    orderBy: { order: "asc" },
  });
  const rule = rules.find(
    (r) => r.sourceName === lead.source?.name || r.sourceName == null,
  );
  if (rule) {
    strategy = rule.strategy as RoutingStrategy;
    requiredSkill = rule.requiredSkill ?? requiredSkill;
    maxAttempts = rule.maxAttempts;
  }

  // 4) Eligible agents: active, available, skilled, not already tried
  const exclude = new Set(opts.excludeAgentIds ?? []);
  const candidates = await prisma.agent.findMany({
    where: { active: true, status: "AVAILABLE" },
  });
  const eligible = candidates.filter(
    (a) => !exclude.has(a.id) && hasSkill(a, requiredSkill),
  );

  // 5) Select
  const agent = pickAgent(strategy, eligible);
  return {
    agent,
    reason: agent ? "agent-selected" : "no-eligible-agent",
    strategy,
    maxAttempts,
  };
}

/**
 * Entry point used by the webhook after a lead is validated: mark it as routing
 * and kick off the first agent-first call attempt.
 */
export async function dispatchLead(leadId: string): Promise<StartAttemptResult> {
  await prisma.lead.update({ where: { id: leadId }, data: { status: "ROUTING" } });
  await logActivity({
    type: "ROUTING_STARTED",
    message: "Evaluating business rules and selecting an agent",
    leadId,
  });
  return startAttempt(leadId, { attemptNumber: 1 });
}

/**
 * Route a lead to an agent and place the first (agent-first) call. Also used by
 * the fallback path in telephony/events.ts to dial the next agent.
 */
export async function startAttempt(
  leadId: string,
  opts: StartAttemptOptions = {},
): Promise<StartAttemptResult> {
  const attemptNumber = opts.attemptNumber ?? 1;
  const decision = await routeLead(leadId, opts);

  // Exhausted the fallback budget, or no agent can be found → finalize lead.
  if (attemptNumber > decision.maxAttempts || !decision.agent) {
    const finalReason =
      attemptNumber > decision.maxAttempts ? "max-attempts-exhausted" : decision.reason;
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "NO_AGENT_AVAILABLE" },
    });
    await logActivity({
      type: "ROUTING_FAILED",
      message: routingFailureMessage(finalReason),
      leadId,
      meta: { reason: finalReason, attemptNumber },
    });
    return { ok: false, reason: finalReason };
  }

  const agent = decision.agent;

  // Reserve the agent atomically: only succeeds if they are still AVAILABLE.
  // This closes the read-then-write race where two concurrent leads both see
  // the same AVAILABLE agent — the loser gets count 0 and re-routes.
  const reserved = await prisma.agent.updateMany({
    where: { id: agent.id, status: "AVAILABLE" },
    data: { status: "BUSY", lastRoutedAt: new Date() },
  });
  if (reserved.count === 0) {
    return startAttempt(leadId, {
      excludeAgentIds: [...(opts.excludeAgentIds ?? []), agent.id],
      attemptNumber,
    });
  }

  const attempt = await prisma.callAttempt.create({
    data: {
      leadId,
      agentId: agent.id,
      attemptNumber,
      state: "PENDING",
    },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "IN_PROGRESS" },
  });
  await logActivity({
    type: "AGENT_SELECTED",
    message: `Selected agent ${agent.name} (${decision.strategy.toLowerCase().replace("_", "-")}), attempt #${attemptNumber}`,
    leadId,
    attemptId: attempt.id,
    meta: { agentId: agent.id, strategy: decision.strategy, attemptNumber },
  });

  // Step 5: call the agent first. If the provider fails to place the call, we
  // must release the agent and finalize the attempt — otherwise the agent is
  // stranded BUSY and the attempt sits in PENDING forever (no event ever
  // advances it).
  try {
    const { provider, config } = await getTelephony();
    const { providerCallSid } = await provider.callAgent({
      attemptId: attempt.id,
      leg: "agent",
      to: agent.phone,
      from: config.platformCallerId,
    });
    await prisma.callAttempt.update({
      where: { id: attempt.id },
      data: { state: "AGENT_RINGING", agentCallSid: providerCallSid },
    });
    await logActivity({
      type: "CALL_PLACED",
      message: `Calling agent ${agent.name}…`,
      leadId,
      attemptId: attempt.id,
      meta: { leg: "agent", to: maskPhone(agent.phone) },
    });
  } catch (err) {
    // Free the agent and finalize the attempt atomically so a placement failure
    // can never strand the agent BUSY with a stuck PENDING attempt.
    await prisma.$transaction([
      prisma.callAttempt.update({
        where: { id: attempt.id },
        data: { state: "FAILED", outcome: "FAILED", endedAt: new Date() },
      }),
      prisma.agent.updateMany({
        where: { id: agent.id, status: "BUSY" },
        data: { status: "AVAILABLE" },
      }),
      prisma.lead.update({ where: { id: leadId }, data: { status: "FAILED" } }),
    ]);
    // The raw provider error goes to server logs only — not into the
    // user-visible activity audit trail.
    logger.error("engine.call_placement_failed", {
      leadId,
      attemptId: attempt.id,
      agentId: agent.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await logActivity({
      type: "ROUTING_FAILED",
      message: `Failed to place call to agent ${agent.name}`,
      leadId,
      attemptId: attempt.id,
    });
    return { ok: false, reason: "call-placement-failed", attemptId: attempt.id };
  }

  return { ok: true, attemptId: attempt.id, reason: "agent-selected" };
}

function routingFailureMessage(reason: string): string {
  switch (reason) {
    case "outside-business-hours":
      return "No routing: outside business hours";
    case "holiday":
      return "No routing: closed for a holiday";
    case "source-disabled":
      return "No routing: lead source is disabled";
    case "max-attempts-exhausted":
      return "No agent connected after exhausting attempts";
    case "no-eligible-agent":
      return "No available agent matched the routing rules";
    default:
      return `Routing failed: ${reason}`;
  }
}
