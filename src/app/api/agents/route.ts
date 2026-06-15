import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentCreateSchema, normalizePhone } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await prisma.agent.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ ok: true, agents });
}

export async function POST(req: NextRequest) {
  const parsed = agentCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = parsed.data;
  const agent = await prisma.agent.create({
    data: { ...data, phone: normalizePhone(data.phone) },
  });
  return NextResponse.json({ ok: true, agent }, { status: 201 });
}
