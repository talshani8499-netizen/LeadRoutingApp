import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { dispatchLead } from "@/lib/routing/engine";
import { leadIntakeSchema, normalizePhone, slugify } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Steps 1–4 of the flow: receive the lead from a form/landing page/ad via
// webhook, validate it, persist it, and kick off routing.
//
// This endpoint is public, so it is the platform's main abuse surface (spam,
// and toll-fraud amplification once Twilio places real calls). It is protected
// by a coarse per-IP rate limit and an optional shared secret.
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  // Optional shared secret. When LEAD_WEBHOOK_SECRET is set, callers must send
  // it (header or ?token=); when unset, the endpoint stays open for the demo.
  if (env.leadWebhookSecret) {
    const supplied =
      req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("token") ?? "";
    if (supplied !== env.leadWebhookSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  // Per-IP rate limit: 30 leads / minute.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`webhook:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

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

  let lead;
  try {
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

    lead = await prisma.lead.create({
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
      meta: { source: data.source ?? null, requestId },
    });
    await logActivity({
      type: "LEAD_VALIDATED",
      message: "Lead data validated",
      leadId: lead.id,
    });
  } catch (err) {
    logger.error("webhook.lead.persist_failed", { requestId, error: errMessage(err) });
    return NextResponse.json({ ok: false, error: "Could not save lead" }, { status: 500 });
  }

  // Fire routing. Wrapped so a routing/provider failure returns a controlled
  // response (with the leadId, so the caller can correlate) instead of an
  // unhandled 500 that leaks a stack trace.
  try {
    const result = await dispatchLead(lead.id);
    return NextResponse.json(
      { ok: true, leadId: lead.id, routed: result.ok, reason: result.reason, attemptId: result.attemptId },
      { status: 201 },
    );
  } catch (err) {
    logger.error("webhook.lead.dispatch_failed", {
      requestId,
      leadId: lead.id,
      error: errMessage(err),
    });
    return NextResponse.json(
      { ok: true, leadId: lead.id, routed: false, reason: "routing-error" },
      { status: 201 },
    );
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
