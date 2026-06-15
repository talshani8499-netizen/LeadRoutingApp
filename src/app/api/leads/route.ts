import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { LEAD_STATUS, type LeadStatus } from "@/lib/enums";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Normalize + validate the optional status filter so a bad/wrong-case value
  // returns a clear 400 instead of silently yielding an empty list.
  const raw = req.nextUrl.searchParams.get("status");
  const status = raw ? (raw.toUpperCase() as LeadStatus) : undefined;
  if (status && !LEAD_STATUS.includes(status)) {
    return NextResponse.json(
      { ok: false, error: `Invalid status filter: ${raw}` },
      { status: 400 },
    );
  }

  const leads = await prisma.lead.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      source: { select: { name: true, label: true } },
      attempts: {
        orderBy: { startedAt: "desc" },
        select: { id: true, state: true, outcome: true, attemptNumber: true },
      },
    },
  });
  return NextResponse.json({ ok: true, leads });
}
