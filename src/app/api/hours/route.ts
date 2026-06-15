import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { businessHoursUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const hours = await prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } });
  return NextResponse.json({ ok: true, hours });
}

// Upsert the full week of business hours in one call.
export async function PUT(req: NextRequest) {
  const parsed = businessHoursUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  for (const day of parsed.data.days) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: day.dayOfWeek },
      update: {
        openMinute: day.openMinute,
        closeMinute: day.closeMinute,
        enabled: day.enabled,
        timezone: day.timezone,
      },
      create: day,
    });
  }
  const hours = await prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } });
  return NextResponse.json({ ok: true, hours });
}
