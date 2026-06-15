import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sourceCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await prisma.leadSource.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json({ ok: true, sources });
}

export async function POST(req: NextRequest) {
  const parsed = sourceCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const source = await prisma.leadSource.create({ data: parsed.data });
  return NextResponse.json({ ok: true, source }, { status: 201 });
}
