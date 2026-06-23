import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.holiday.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError("holidays.delete_failed", err);
  }
}
