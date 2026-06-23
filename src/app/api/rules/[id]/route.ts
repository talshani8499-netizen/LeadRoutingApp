import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ruleUpdateSchema } from "@/lib/validation";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = ruleUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  try {
    const rule = await prisma.routingRule.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    return apiError("rules.patch_failed", err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.routingRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError("rules.delete_failed", err);
  }
}
