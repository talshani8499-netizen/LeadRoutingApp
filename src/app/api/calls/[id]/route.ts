import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Single call attempt with its full activity timeline.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attempt = await prisma.callAttempt.findUnique({
    where: { id },
    include: {
      lead: true,
      agent: true,
      activities: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!attempt) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, attempt });
}
