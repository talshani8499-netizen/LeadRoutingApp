import { prisma } from "@/lib/db";
import { handleTelephonyEvent } from "./events";
import type { CallLeg, TelephonyStatus } from "./types";

// Advance the simulator: find every CallAttempt whose scheduled transition is
// now due and feed the corresponding event into the state machine. This is the
// simulator's analogue of an incoming Twilio webhook. It is idempotent and
// cheap, and is invoked both by the dashboard's poll and by the optional
// in-process ticker.

export async function runSimTick(): Promise<{ applied: number }> {
  const now = new Date();
  const due = await prisma.callAttempt.findMany({
    where: {
      nextTransitionAt: { not: null, lte: now },
      pendingLeg: { not: null },
      pendingStatus: { not: null },
    },
    select: {
      id: true,
      pendingLeg: true,
      pendingStatus: true,
      agentCallSid: true,
      leadCallSid: true,
    },
  });

  let applied = 0;
  for (const attempt of due) {
    const leg = attempt.pendingLeg as CallLeg;
    const status = attempt.pendingStatus as TelephonyStatus;
    const providerCallSid =
      (leg === "agent" ? attempt.agentCallSid : attempt.leadCallSid) ?? `sim-${attempt.id}`;

    await handleTelephonyEvent({
      attemptId: attempt.id,
      providerCallSid,
      leg,
      status,
    });
    applied += 1;
  }

  return { applied };
}
