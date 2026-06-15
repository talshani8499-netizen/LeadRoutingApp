import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentUpdateSchema, normalizePhone } from "@/lib/validation";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = agentUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = { ...parsed.data };
  if (data.phone) data.phone = normalizePhone(data.phone);
  try {
    const agent = await prisma.agent.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true, agent });
  } catch (err) {
    return apiError("agents.patch_failed", err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Soft delete: deactivate so historical call attempts remain intact.
  try {
    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: { active: false, status: "OFFLINE" },
    });
    return NextResponse.json({ ok: true, agent });
  } catch (err) {
    return apiError("agents.delete_failed", err);
  }
}
