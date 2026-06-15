import type { ActivityType } from "@/lib/enums";
import { prisma } from "@/lib/db";

interface LogActivityInput {
  type: ActivityType;
  message: string;
  leadId?: string | null;
  attemptId?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Append an entry to the activity log. Every meaningful step in the routing
 * and call flow flows through here so the dashboard has a complete audit trail.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  await prisma.activityLog.create({
    data: {
      type: input.type,
      message: input.message,
      leadId: input.leadId ?? undefined,
      attemptId: input.attemptId ?? undefined,
      meta: input.meta ? JSON.stringify(input.meta) : undefined,
    },
  });
}
