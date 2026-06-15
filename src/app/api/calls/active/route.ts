import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runSimTick } from "@/lib/telephony/tick";
import { env } from "@/lib/env";
import { ACTIVE_CALL_STATES } from "@/lib/enums";

export const dynamic = "force-dynamic";

// Powers the live call activity view. Crucially, polling this endpoint also
// advances the simulator (unless an in-process ticker is enabled), so simply
// watching the dashboard drives the call flow forward.
export async function GET() {
  if (env.provider === "simulator" && !env.enableSimTicker) {
    await runSimTick();
  }

  const [active, recent] = await Promise.all([
    prisma.callAttempt.findMany({
      where: { state: { in: ACTIVE_CALL_STATES } },
      orderBy: { startedAt: "desc" },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true } },
      },
    }),
    prisma.callAttempt.findMany({
      where: { state: { notIn: ACTIVE_CALL_STATES } },
      orderBy: { startedAt: "desc" },
      take: 15,
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, active, recent });
}
