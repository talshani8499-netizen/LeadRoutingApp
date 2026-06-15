import { prisma } from "@/lib/db";
import type {
  BridgeParams,
  PlaceCallParams,
  PlaceCallResult,
  TelephonyProvider,
  TelephonyStatus,
} from "./types";

// The simulator never sleeps in-process. Instead it persists a single pending
// transition (pendingLeg / pendingStatus / nextTransitionAt) onto the
// CallAttempt row. The tick endpoint later finds due transitions and feeds them
// to handleTelephonyEvent(), exactly mirroring how Twilio's statusCallback
// webhooks would arrive.

type Weighted = { status: TelephonyStatus; weight: number };

// Outcome distributions tuned to feel realistic while still demoing every
// branch within a handful of leads.
const AGENT_OUTCOMES: Weighted[] = [
  { status: "answered", weight: 75 },
  { status: "no-answer", weight: 16 },
  { status: "busy", weight: 5 },
  { status: "failed", weight: 4 },
];

const LEAD_OUTCOMES: Weighted[] = [
  { status: "answered", weight: 68 },
  { status: "no-answer", weight: 20 },
  { status: "busy", weight: 8 },
  { status: "failed", weight: 4 },
];

function weightedPick(options: Weighted[]): TelephonyStatus {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.status;
  }
  return options[options.length - 1].status;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Ring/talk durations (ms). Kept short so the whole flow is visible quickly
// while a human watches the dashboard.
const RING_MS = { min: 2000, max: 4500 };
const TALK_MS = { min: 6000, max: 14000 };

async function schedule(
  attemptId: string,
  leg: "agent" | "lead",
  status: TelephonyStatus,
  delayMs: number,
): Promise<void> {
  await prisma.callAttempt.update({
    where: { id: attemptId },
    data: {
      pendingLeg: leg,
      pendingStatus: status,
      nextTransitionAt: new Date(Date.now() + delayMs),
    },
  });
}

export class SimulatorProvider implements TelephonyProvider {
  readonly name = "simulator" as const;

  async callAgent(params: PlaceCallParams): Promise<PlaceCallResult> {
    const sid = `sim-agent-${crypto.randomUUID()}`;
    const outcome = weightedPick(AGENT_OUTCOMES);
    await schedule(params.attemptId, "agent", outcome, randomBetween(RING_MS.min, RING_MS.max));
    return { providerCallSid: sid };
  }

  async callLead(params: PlaceCallParams): Promise<PlaceCallResult> {
    const sid = `sim-lead-${crypto.randomUUID()}`;
    const outcome = weightedPick(LEAD_OUTCOMES);
    await schedule(params.attemptId, "lead", outcome, randomBetween(RING_MS.min, RING_MS.max));
    return { providerCallSid: sid };
  }

  async bridge(params: BridgeParams): Promise<void> {
    // Both legs are live; schedule the natural end of the conversation.
    await schedule(params.attemptId, "lead", "completed", randomBetween(TALK_MS.min, TALK_MS.max));
  }

  async hangup(_providerCallSid: string): Promise<void> {
    // No-op for the simulator; the scheduled completion handles teardown.
  }
}
