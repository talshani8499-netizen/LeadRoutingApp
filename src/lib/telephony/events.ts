import type { CallAttempt } from "@prisma/client";
import type { CallAttemptState } from "@/lib/enums";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import {
  isTerminal,
  leadStatusForState,
  nextState,
  outcomeForState,
  stateLabel,
} from "@/lib/routing/stateMachine";
import { startAttempt } from "@/lib/routing/engine";
import { getProvider } from "./index";
import type { TelephonyEvent } from "./types";

// The single place where a telephony event mutates persisted call state. Both
// the simulator tick and the (future) Twilio webhook funnel through here, so
// the state-transition logic is identical for both providers.

export async function handleTelephonyEvent(e: TelephonyEvent): Promise<void> {
  const attempt = await prisma.callAttempt.findUnique({
    where: { id: e.attemptId },
    include: { lead: true, agent: true },
  });
  if (!attempt) return;

  const currentState = attempt.state as CallAttemptState;
  // Idempotency / ordering guard: terminal attempts ignore further events.
  if (isTerminal(currentState)) return;

  const target = nextState(currentState, e.leg, e.status);
  if (!target) return; // not a valid transition from the current state — no-op

  // Clear the pending simulator transition as we apply this one so it cannot
  // be re-processed by a concurrent/duplicate tick.
  await prisma.callAttempt.update({
    where: { id: attempt.id },
    data: {
      state: target,
      pendingLeg: null,
      pendingStatus: null,
      nextTransitionAt: null,
    },
  });

  await logActivity({
    type: "STATE_CHANGED",
    message: stateLabel(target),
    leadId: attempt.leadId,
    attemptId: attempt.id,
    meta: { from: attempt.state, to: target, leg: e.leg, status: e.status },
  });

  switch (target) {
    case "AGENT_CONNECTED":
      await onAgentConnected(attempt);
      break;
    case "BRIDGED":
      await onBridged(attempt);
      break;
    case "COMPLETED":
      await finalizeAttempt(attempt.id, "COMPLETED");
      break;
    case "NO_ANSWER":
    case "BUSY":
    case "FAILED":
      // Lead-side terminal outcome: hang up the agent and finalize.
      if (attempt.agentCallSid) await safeHangup(attempt.agentCallSid);
      await finalizeAttempt(attempt.id, target);
      break;
    case "AGENT_NO_ANSWER":
      await onAgentNoAnswer(attempt);
      break;
    default:
      break;
  }
}

/** Step 6: the agent picked up — immediately call the lead. */
async function onAgentConnected(attempt: AttemptWithRefs): Promise<void> {
  const provider = getProvider();
  const { providerCallSid } = await provider.callLead({
    attemptId: attempt.id,
    leg: "lead",
    to: attempt.lead.phone,
    from: env.platformCallerId,
  });
  await prisma.callAttempt.update({
    where: { id: attempt.id },
    data: { state: "LEAD_RINGING", leadCallSid: providerCallSid },
  });
  await logActivity({
    type: "CALL_PLACED",
    message: `Agent answered — calling lead ${attempt.lead.name}…`,
    leadId: attempt.leadId,
    attemptId: attempt.id,
    meta: { leg: "lead", to: attempt.lead.phone },
  });
}

/** Step 7–8: both legs are live — connect them. */
async function onBridged(attempt: AttemptWithRefs): Promise<void> {
  const conferenceName = `room-${attempt.id}`;
  await prisma.callAttempt.update({
    where: { id: attempt.id },
    data: { conferenceName, bridgedAt: new Date() },
  });
  const provider = getProvider();
  await provider.bridge({
    attemptId: attempt.id,
    agentCallSid: attempt.agentCallSid ?? "",
    leadCallSid: attempt.leadCallSid ?? "",
    conferenceName,
  });
  await logActivity({
    type: "STATE_CHANGED",
    message: `Lead answered — ${attempt.agent.name} and ${attempt.lead.name} are connected`,
    leadId: attempt.leadId,
    attemptId: attempt.id,
    meta: { conferenceName },
  });
}

/** Agent didn't answer — record the attempt, free the agent, try the next one. */
async function onAgentNoAnswer(attempt: AttemptWithRefs): Promise<void> {
  await finalizeAttempt(attempt.id, "AGENT_NO_ANSWER");

  // Exclude every agent already tried for this lead.
  const priorAttempts = await prisma.callAttempt.findMany({
    where: { leadId: attempt.leadId },
    select: { agentId: true },
  });
  const excludeAgentIds = Array.from(new Set(priorAttempts.map((a) => a.agentId)));

  await logActivity({
    type: "ROUTING_STARTED",
    message: `Agent ${attempt.agent.name} did not answer — routing to next agent`,
    leadId: attempt.leadId,
    attemptId: attempt.id,
  });

  await startAttempt(attempt.leadId, {
    excludeAgentIds,
    attemptNumber: attempt.attemptNumber + 1,
  });
}

/**
 * Finalize a terminal attempt: record outcome + duration, free the agent, and
 * (for lead-facing terminal states) update the lead's status.
 */
async function finalizeAttempt(
  attemptId: string,
  state: Parameters<typeof outcomeForState>[0],
): Promise<void> {
  const attempt = await prisma.callAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return;

  const endedAt = new Date();
  // Talk time is measured from when the legs were bridged (for a connected
  // call); without a bridge it falls back to the whole attempt duration.
  const durationBasis = attempt.bridgedAt ?? attempt.startedAt;
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - durationBasis.getTime()) / 1000),
  );
  const outcome = outcomeForState(state);

  await prisma.callAttempt.update({
    where: { id: attemptId },
    data: {
      state,
      outcome: outcome ?? undefined,
      endedAt,
      durationSec,
      pendingLeg: null,
      pendingStatus: null,
      nextTransitionAt: null,
    },
  });

  // Release the agent back to the pool (unless they were taken offline).
  const agent = await prisma.agent.findUnique({ where: { id: attempt.agentId } });
  if (agent && agent.status !== "OFFLINE") {
    await prisma.agent.update({
      where: { id: attempt.agentId },
      data: { status: "AVAILABLE" },
    });
  }

  // Update the lead only for lead-facing terminal states (an agent no-answer
  // keeps the lead in-progress while fallback continues).
  const leadStatus = leadStatusForState(state);
  if (leadStatus) {
    await prisma.lead.update({
      where: { id: attempt.leadId },
      data: { status: leadStatus },
    });
    await logActivity({
      type: "CALL_COMPLETED",
      message:
        state === "COMPLETED"
          ? `Call connected (${durationSec}s)`
          : `Call ended: ${stateLabel(state)}`,
      leadId: attempt.leadId,
      attemptId: attempt.id,
      meta: { outcome, durationSec },
    });
  }
}

async function safeHangup(providerCallSid: string): Promise<void> {
  try {
    await getProvider().hangup(providerCallSid);
  } catch {
    // Hangup is best-effort; ignore provider errors during teardown.
  }
}

type AttemptWithRefs = CallAttempt & {
  lead: { id: string; name: string; phone: string };
  agent: { id: string; name: string };
};
