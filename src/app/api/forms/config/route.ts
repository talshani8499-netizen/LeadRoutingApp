import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getFormsConfig } from "@/lib/forms/config";
import { formsConfigSchema } from "@/lib/validation";
import { BUILT_IN_ALIASES } from "@/lib/leadIntake";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

// Editable Connect Forms config for the settings page.
export async function GET() {
  const cfg = await getFormsConfig();
  return NextResponse.json({
    defaultSource: cfg.defaultSource,
    fieldMap: cfg.fieldMap,
    builtInAliases: BUILT_IN_ALIASES,
    secretRequired: Boolean(env.leadWebhookSecret),
    webhookPath: "/api/webhook/lead",
  });
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = formsConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const d = parsed.data;

  const base = {
    defaultSource: d.defaultSource ?? null,
    fieldMap:
      d.fieldMap && Object.keys(d.fieldMap).length ? JSON.stringify(d.fieldMap) : null,
  };

  try {
    await prisma.formConfig.upsert({
      where: { id: "default" },
      update: base,
      create: { id: "default", ...base },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError("forms.config.save_failed", err);
  }
}
