import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
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
