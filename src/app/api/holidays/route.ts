import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { holidayCreateSchema } from "@/lib/validation";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET() {
  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json({ ok: true, holidays });
}

export async function POST(req: NextRequest) {
  const parsed = holidayCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  try {
    const holiday = await prisma.holiday.create({ data: parsed.data });
    return NextResponse.json({ ok: true, holiday }, { status: 201 });
  } catch (err) {
    return apiError("holidays.create_failed", err);
  }
}
