import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
  const leadId = req.nextUrl.searchParams.get("leadId");
  const activities = await prisma.activityLog.findMany({
    where: leadId ? { leadId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      lead: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ ok: true, activities });
}
