import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { dispatchLead, previewRouting } from "@/lib/routing/engine";
import { leadIntakeSchema, normalizePhone, slugify } from "@/lib/validation";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { timingSafeEqualStr } from "@/lib/safeCompare";
import { getTelephonyConfig } from "@/lib/telephony/config";
import { parseInboundBody, mapLeadFields } from "@/lib/leadIntake";
import { getFormsConfig } from "@/lib/forms/config";

export const dynamic = "force-dynamic";

// Steps 1–4 of the flow: receive the lead from a form/landing page/ad via
// webhook, validate it, persist it, and kick off routing.
//
// This endpoint is public, so it is the platform's main abuse surface (spam,
// and toll-fraud amplification once Twilio places real calls). Defenses:
//   - an optional shared secret (constant-time compared),
//   - a per-IP rate limit (Redis-backed when configured),
//   - idempotency/dedupe so retried deliveries don't create duplicate calls,
//   - outbound-call spend caps before any real call is placed.
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  // Optional shared secret. When LEAD_WEBHOOK_SECRET is set, callers must send
  // it (header or ?token=); when unset, the endpoint stays open for the demo.
  if (env.leadWebhookSecret) {
    const supplied =
      req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("token") ?? "";
    if (!timingSafeEqualStr(supplied, env.leadWebhookSecret)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  // Per-IP rate limit: 30 leads / minute. The IP is resolved defensively so a
  // client can't mint a fresh bucket by spoofing X-Forwarded-For (see getClientIp).
  const ip = getClientIp(req.headers);
  const rl = await rateLimit(`webhook:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Parse the body (JSON / x-www-form-urlencoded / multipart) and map arbitrary
  // form field names onto our canonical fields (built-in aliases + custom map).
  const raw = await parseInboundBody(req);
  const formsCfg = await getFormsConfig();
  const mapped = mapLeadFields(raw, formsCfg.fieldMap);
  if (mapped.source === undefined && formsCfg.defaultSource) {
    mapped.source = formsCfg.defaultSource;
  }

  const parsed = leadIntakeSchema.safeParse(mapped);

  // Dry-run: validate + preview routing WITHOUT creating a lead or dialing.
  const dryRun =
    req.nextUrl.searchParams.get("dryRun") === "1" || req.headers.get("x-dry-run") === "1";
  if (dryRun) {
    return NextResponse.json({
      ok: parsed.success,
      dryRun: true,
      raw,
      mapped,
      validation: parsed.success
        ? { ok: true }
        : { ok: false, errors: parsed.error.flatten().fieldErrors },
      routingPreview: parsed.success ? await previewRouting(parsed.data.source) : null,
    });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = parsed.data;
  const phone = normalizePhone(data.phone);

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

    // Idempotency: collapse duplicate deliveries so retries don't create
    // duplicate leads (and duplicate outbound calls). Prefer an explicit
    // externalId; otherwise treat the same (phone, source) within 60s as a dup.
    const existing = data.externalId
      ? await prisma.lead.findFirst({ where: { externalId: data.externalId } })
      : await prisma.lead.findFirst({
          where: { phone, sourceId: sourceId ?? null, createdAt: { gte: new Date(Date.now() - 60_000) } },
          orderBy: { createdAt: "desc" },
        });
    if (existing) {
      logger.info("webhook.lead.deduped", { requestId, leadId: existing.id });
      return NextResponse.json(
        { ok: true, leadId: existing.id, deduped: true },
        { status: 200 },
      );
    }

    lead = await prisma.lead.create({
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

  // Outbound-call spend caps — toll-fraud defense. Only meaningful when real
  // calls are placed (Twilio); the simulator costs nothing. Caps are DB-backed
  // so they hold across serverless instances.
  const tele = await getTelephonyConfig();
  if (tele.provider !== "simulator") {
    const now = Date.now();
    const [globalRecent, perDest] = await Promise.all([
      prisma.callAttempt.count({ where: { startedAt: { gte: new Date(now - 60_000) } } }),
      prisma.callAttempt.count({
        where: { startedAt: { gte: new Date(now - 3_600_000) }, lead: { phone } },
      }),
    ]);
    if (
      globalRecent >= env.callCaps.globalPerMin ||
      perDest >= env.callCaps.perDestinationPerHour
    ) {
      logger.warn("webhook.lead.call_capped", { requestId, leadId: lead.id, globalRecent, perDest });
      await logActivity({
        type: "ROUTING_FAILED",
        message: "No routing: outbound-call cap reached",
        leadId: lead.id,
      });
      return NextResponse.json(
        { ok: true, leadId: lead.id, routed: false, reason: "rate-capped" },
        { status: 201 },
      );
    }
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
