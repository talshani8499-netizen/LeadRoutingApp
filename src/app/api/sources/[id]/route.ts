import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sourceUpdateSchema } from "@/lib/validation";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = sourceUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  try {
    const source = await prisma.leadSource.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json({ ok: true, source });
  } catch (err) {
    return apiError("sources.patch_failed", err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Detach any leads first so historical leads aren't orphaned by a foreign-key
  // violation; then delete. Both happen atomically.
  try {
    await prisma.$transaction([
      prisma.lead.updateMany({ where: { sourceId: params.id }, data: { sourceId: null } }),
      prisma.leadSource.delete({ where: { id: params.id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError("sources.delete_failed", err);
  }
}
