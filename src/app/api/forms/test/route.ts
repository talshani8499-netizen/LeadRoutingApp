import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formTestSchema, leadIntakeSchema, normalizePhone, slugify } from "@/lib/validation";
import { getFormsConfig } from "@/lib/forms/config";
import { mapLeadFields, parseBodyString } from "@/lib/leadIntake";
import { previewRouting, dispatchLead } from "@/lib/routing/engine";
import { logActivity } from "@/lib/activity";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

// Powers the Connect Forms test console. Dashboard-authenticated (NOT in the
// middleware PUBLIC_PATHS), so it needs no public webhook secret while still
// running the exact same parse -> map -> validate -> route pipeline.
//   mode "dry"  -> validate + preview routing, no writes.
//   mode "live" -> create a real lead and route it (same as a real submission).
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = formTestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { mode, fields, rawBody, contentType } = parsed.data;

  const raw: Record<string, unknown> = fields ?? parseBodyString(rawBody ?? "", contentType ?? "");
  const cfg = await getFormsConfig();
  const mapped = mapLeadFields(raw, cfg.fieldMap);
  if (mapped.source === undefined && cfg.defaultSource) mapped.source = cfg.defaultSource;

  const validation = leadIntakeSchema.safeParse(mapped);

  // Dry run (or any validation failure) -> preview only, no writes.
  if (mode === "dry" || !validation.success) {
    return NextResponse.json({
      ok: validation.success,
      mode: "dry",
      raw,
      mapped,
      validation: validation.success
        ? { ok: true }
        : { ok: false, errors: validation.error.flatten().fieldErrors },
      routingPreview: validation.success ? await previewRouting(validation.data.source) : null,
    });
  }

  // Live -> create + route a real lead (this is exactly what a real form does;
  // in Twilio mode it will place a real call).
  try {
    const data = validation.data;
    const phone = normalizePhone(data.phone);

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
        phone,
        email: data.email,
        notes: data.notes,
        externalId: data.externalId,
        sourceId,
        status: "NEW",
      },
    });
    await logActivity({
      type: "LEAD_RECEIVED",
      message: `Test lead received: ${lead.name} (${data.source ?? "direct"})`,
      leadId: lead.id,
      meta: { test: true },
    });

    const result = await dispatchLead(lead.id);
    return NextResponse.json({
      ok: true,
      mode: "live",
      raw,
      mapped,
      validation: { ok: true },
      lead: { id: lead.id, routed: result.ok, reason: result.reason, attemptId: result.attemptId },
    });
  } catch (err) {
    return apiError("forms.test.live_failed", err);
  }
}
