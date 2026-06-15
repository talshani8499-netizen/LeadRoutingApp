import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ruleCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const rules = await prisma.routingRule.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ ok: true, rules });
}

export async function POST(req: NextRequest) {
  const parsed = ruleCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const rule = await prisma.routingRule.create({ data: parsed.data });
  return NextResponse.json({ ok: true, rule }, { status: 201 });
}
