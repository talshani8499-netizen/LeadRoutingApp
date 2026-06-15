import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { dispatchLead } from "@/lib/routing/engine";
import { leadIntakeSchema, normalizePhone, slugify } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Steps 1–4 of the flow: receive the lead from a form/landing page/ad via
// webhook, validate it, persist it, and kick off routing.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = leadIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = parsed.data;

  // Resolve the lead source (auto-create unknown sources so no lead is lost).
  let sourceId: string | undefined;
  if (data.source) {
    const slug = slugify(data.source);
    const source = await prisma.leadSource.upsert({
      where: { name: slug },
      update: { label: data.source },
      create: { name: slug, label: data.source, enabled: true },
    });
    sourceId = source.id;
  }

  const lead = await prisma.lead.create({
    data: {
      name: data.name,
      phone: normalizePhone(data.phone),
      email: data.email,
      notes: data.notes,
      sourceId,
      status: "NEW",
    },
  });

  await logActivity({
    type: "LEAD_RECEIVED",
    message: `New lead received: ${lead.name} (${data.source ?? "direct"})`,
    leadId: lead.id,
    meta: { source: data.source ?? null },
  });
  await logActivity({
    type: "LEAD_VALIDATED",
    message: "Lead data validated",
    leadId: lead.id,
  });

  // Fire routing. We await so the first call attempt is placed before we
  // respond, which keeps the demo deterministic.
  const result = await dispatchLead(lead.id);

  return NextResponse.json(
    {
      ok: true,
      leadId: lead.id,
      routed: result.ok,
      reason: result.reason,
      attemptId: result.attemptId,
    },
    { status: 201 },
  );
}
