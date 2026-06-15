# Review & Improvement Report — RouteDesk Lead Routing Platform

_Date: 2026-06-15 · Branch: `claude/lead-routing-happy-flow-nheoit` · Scope: full review-and-improvement run_

## Executive summary

RouteDesk is a call-routing platform (Next.js App Router + TypeScript + Prisma/SQLite) that
ingests inbound leads via webhook, evaluates routing rules, and bridges an agent-first call to the
lead through a pluggable telephony provider (a credential-free **simulator** by default, with a
wired **Twilio** adapter).

This run executed a complete **map → review → implement → validate → re-review** cycle. Six review
passes (backend/domain, security, frontend/UX, accessibility, tests, and a final regression pass)
were run as isolated agents. The most material gaps for a telephony product were **operational
safety** (concurrency races on call state, transaction boundaries) and **provider/edge security**
(unauthenticated webhooks that mutate call state and place real calls). All **CRITICAL** and **HIGH**
findings in touched areas were fixed with small, backwards-compatible changes; larger items
(full multi-tenant auth, holiday calendars, idempotency keys) are documented for the next sprint.

**Validation:** `tsc --noEmit` clean · `npm test` 36/36 green · `next build` succeeds · end-to-end
smoke tests confirm the happy flow, rate limiting, PII masking, the optional Basic-auth gate, the
lead-webhook secret, and Twilio signature verification (a correctly-computed HMAC-SHA1 signature is
accepted; forged/missing signatures are rejected with 403).

> Note: this run is a continuation of an earlier review that already fixed 10 issues (agent
> reservation race, BUSY-leak, simulator tick double-processing, talk-time accuracy, source
> slugification, boolean coercion, business-hours range validation, leads filter validation,
> analytics aggregation). Those are summarized in PR #1; this report covers the **second** pass.

## Architecture map

| Layer | Location | Notes |
|---|---|---|
| Framework | Next.js 14.2 (App Router), TypeScript, React 18 | `next start` single Node process |
| Data | Prisma 5 + SQLite (`prisma/schema.prisma`) | enums stored as strings (SQLite); types in `src/lib/enums.ts` |
| Routing engine | `src/lib/routing/{engine,stateMachine,businessHours}.ts` | rule eval, agent selection, pure CAS state machine |
| Telephony | `src/lib/telephony/{types,events,simulator,twilio,tick,index}.ts` | one `TelephonyProvider` interface; `handleTelephonyEvent` is the single state-mutation path |
| API | `src/app/api/**/route.ts` | webhook intake, telephony callbacks, calls, CRUD, analytics |
| Dashboard | `src/app/dashboard/**`, `src/components/**` | overview, live calls, leads, agents, settings; poll-driven via `usePolling` |
| Observability | `src/lib/activity.ts` (audit), `src/lib/logger.ts` (structured logs) | |
| Tests | Vitest (`src/**/*.test.ts`), `npm test` | pure-function unit tests |

**Main flow:** form → `POST /api/webhook/lead` (validate, rate-limit, optional secret) →
`dispatchLead` → `routeLead` (business hours + source + rules + agent eligibility) → `startAttempt`
(atomic agent reservation, `callAgent`) → simulator/Twilio events → `handleTelephonyEvent` (atomic
compare-and-swap state machine) → bridge → `finalizeAttempt` (transactional outcome + agent release)
→ dashboard.

**Telephony real-time model:** all call state is persisted (route handlers are stateless). The
simulator schedules timed transitions; the dashboard poll (or an optional in-process ticker)
advances them via an idempotent, atomically-claimed tick. Twilio events arrive as signed webhooks.
Both normalize to the same `TelephonyEvent`.

## Review methodology

Each reviewer role ran as an isolated agent against the current code (the 21st.dev Magic MCP and the
named bespoke subagents were **not configured in this environment** — see Blockers — so reviewer
roles were simulated as separate passes and UI work used the existing Tailwind design system):

- **backend/domain** — routing determinism, webhook idempotency/verification, races, transactions, indexes, observability.
- **security** — auth/RBAC/tenant isolation, webhook verification, rate limiting, PII, secrets, safe errors.
- **frontend/UX + accessibility** — clarity, destructive-action safety, empty/loading/error states, labels, keyboard/focus, responsiveness, contrast.
- **test-engineer** — coverage gaps, fragile tests, high-value pure-function additions.
- **final-reviewer** — regression review of the implemented diff.

## Findings by severity (this pass)

### CRITICAL
- **C-SEC-1 — Every admin API + dashboard is unauthenticated** (all `/api/**`): full PII read and full control of routing for anyone who can reach the host. _Fixed (opt-in):_ `src/middleware.ts` Basic-auth gate keyed on `DASHBOARD_PASSWORD`; public webhooks excluded (they carry their own verification). Default-off preserves the demo.
- **C-SEC-2 — Public lead webhook triggers real outbound calls** (`/api/webhook/lead`): toll-fraud / robo-dial / DoS vector. _Fixed:_ per-IP rate limit (30/min) + optional `LEAD_WEBHOOK_SECRET`; source auto-creation slugified.
- **C-BE-1 — `handleTelephonyEvent` transition guard was not atomic**: duplicate/concurrent events (Twilio at-least-once delivery) could double-fire side effects (e.g. dial the lead twice). _Fixed:_ conditional `updateMany` **compare-and-swap** on `(id, state)`; only the winner runs side effects. Generalizes the simulator-tick claim to all providers.

### HIGH
- **H-SEC-1 / H-SEC-2 — Twilio status & voice webhooks had no signature check**: forged/replayed callbacks could drive the call state machine. _Fixed:_ `isValidTwilioSignature` (HMAC-SHA1 via Web Crypto) enforced in Twilio mode; 403 on mismatch.
- **H-BE-1 — `providerCallSid` never correlated to the leg**: a stale-leg event could mis-transition a live call. _Fixed:_ event is rejected when its SID doesn't match the tracked `agentCallSid`/`leadCallSid` for that leg.
- **H-BE-2 — No transaction boundaries**: a crash mid-finalize could strand an agent `BUSY` forever. _Fixed:_ `finalizeAttempt` and the placement-failure path now use `prisma.$transaction`; agent release is conditional (`status != OFFLINE`).
- **H-BE-3 — Webhook awaited `dispatchLead` with no try/catch**: a routing/provider throw returned an unhandled 500 (stack leak) and dropped the `leadId`. _Fixed:_ wrapped; returns a controlled response with `leadId` and logs server-side.
- **H-UX-1 — Silent stale dashboards**: `usePolling` errors were never surfaced; a dead feed looked live. _Fixed:_ `lastUpdated` added; `StaleBanner` on Overview/Live Calls/Leads.
- **H-UX-2 — Destructive actions had no confirmation**: one click deleted a source/rule or deactivated an agent. _Fixed:_ `ConfirmButton` two-step confirm on all destructive actions.
- **H-UX-3 — Mobile users could not navigate**: sidebar hidden below `md` with no alternative. _Fixed:_ `DashboardShell` hamburger + slide-in drawer.
- **H-A11Y-1 — Form labels not associated; modal not accessible.** _Fixed (modal + key forms):_ `SimulateLead` is now `role="dialog"`/`aria-modal`/`aria-labelledby`, Escape-to-close, focus-in, labeled inputs, `aria-label` close.

### MEDIUM (fixed)
- **M-SEC-1 — PII in audit log**: phone numbers stored raw in `ActivityLog.meta`. _Fixed:_ `maskPhone` (last-4) everywhere; raw provider error strings moved to server logs only.
- **M-SEC-2 / M-BE — Prisma errors leaked as 500s** on missing/duplicate records. _Fixed:_ `apiError` helper maps `P2025→404`, `P2002/P2003→409`, else generic 500; applied to all `[id]` mutations.
- **M-BE-3 — Missing hot-path indexes.** _Fixed:_ `Agent(active,status)`, `CallAttempt(agentId)`, `CallAttempt(outcome)`.
- **M-BE-4 — Non-atomic hours upsert + source delete FK orphan.** _Fixed:_ hours PUT and source delete (detach-then-delete) wrapped in `$transaction`.
- **M-OBS — No structured logging.** _Fixed:_ `src/lib/logger.ts` (single-line JSON) + `requestId` on the webhook path.
- **M-UX — Weak empty states, no fetch error handling on settings pages, tables clipped on mobile, low-contrast badges, missing routing microcopy.** _Fixed:_ actionable empty states, load-error banners + `res.ok` guards, `overflow-x-auto`, `yellow-800` text, source/rule precedence + skill-fallback microcopy.

### LOW / deferred (documented, not fixed)
- **Holidays & overnight business-hours windows** unsupported (validation prevents the silent-closed footgun; DST itself is handled correctly via `Intl`).
- **Webhook idempotency keys** — retried deliveries can still create duplicate leads; recommend an `externalId` dedupe.
- **Full multi-tenant auth + RBAC** — the Basic-auth gate is an MVP guard, not per-user accounts/tenant isolation.
- **`normalizePhone` is US-centric** (`+1` on 10-digit) — fine for the SMB-US target.
- **`getProvider` caches process-wide** — credential rotation needs a restart (documented).
- Per-day timezone rows are collapsed to one tz; toast/success feedback and a few `aria-pressed`/contrast refinements remain partial.

## UI/UX review — findings and improvements

The product was already visually clean and consistent (card/btn/brand-indigo system, a strong live
call-pipeline visualization, good rules microcopy). The gaps were **operational safety and
accessibility**, now addressed:

1. **Confirmation on destructive actions** (`ConfirmButton`) — agents/sources/rules.
2. **Mobile navigation** (`DashboardShell` hamburger + drawer, Escape/route-change close).
3. **Stale-data visibility** (`StaleBanner` + `usePolling.lastUpdated`).
4. **Settings pages fetch-error handling** — load-error banners, `res.ok` checks, no more permanent "Loading…".
5. **Accessible modal + labeled inputs** in `SimulateLead`; `aria-hidden` on decorative nav icons; `aria-label="Primary"` on nav; `aria-pressed` on enable/disable toggles.
6. **Actionable empty states** on every list; **horizontal-scroll tables** on mobile; **higher-contrast** badges; **routing microcopy** clarifying source-vs-rule precedence and skill fallback.

## 21st.dev Magic MCP usage summary

**Not used — unavailable in this environment.** A tool search for the 21st.dev Magic MCP returned no
matching tools, and no MCP UI-generation server was connected. To avoid introducing an inconsistent
design system, all UI improvements were implemented by hand using the existing Tailwind tokens and
component classes (`card`, `btn`, `btn-ghost`, `btn-danger`, `input`, `label`, brand-indigo palette)
already defined in `src/app/globals.css`. If the Magic MCP is configured later, good candidates for
generation/refinement are: a routing rule-builder, a richer logs table with filters, and a
first-run setup wizard.

## Improvements implemented (files changed)

**New files:** `src/middleware.ts`, `src/lib/rateLimit.ts`, `src/lib/logger.ts`, `src/lib/apiError.ts`,
`src/components/{ConfirmButton,StaleBanner,DashboardShell}.tsx`, `src/lib/labels.test.ts`.

**Backend/security:** `src/app/api/webhook/lead/route.ts`, `src/app/api/telephony/twilio/{status,voice}/route.ts`,
`src/lib/telephony/{twilio,events}.ts`, `src/lib/routing/engine.ts`, `src/app/api/{agents,sources,rules}/[id]/route.ts`,
`src/app/api/hours/route.ts`, `src/lib/env.ts`, `prisma/schema.prisma`.

**Frontend/UX:** `src/components/{Sidebar,SimulateLead}.tsx`, `src/app/dashboard/layout.tsx`,
`src/app/dashboard/{page,activity/page,leads/page,agents/page}.tsx`,
`src/app/dashboard/settings/{sources,rules}/page.tsx`, `src/lib/{usePolling,labels}.ts`.

**Tests:** extended `stateMachine.test.ts`, `businessHours.test.ts`, `validation.test.ts`; added `labels.test.ts`.

## Validation commands run & results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` (vitest) | **36/36 passed** (5 files) |
| `npm run build` | compiled successfully, 11/11 pages |
| E2E: happy flow (simulator) | routed → `AGENT_RINGING→…→COMPLETED`; talk-time from bridge |
| E2E: rate limit | 30×201 then 3×429 (`Retry-After` set) |
| E2E: PII masking | `ActivityLog.meta.to = "***0001"` |
| E2E: Basic-auth gate (`DASHBOARD_PASSWORD`) | no/wrong creds → 401, correct → 200; `/api/leads` → 401; webhook stays public |
| E2E: webhook secret (`LEAD_WEBHOOK_SECRET`) | no secret → 401, with secret → 201 |
| E2E: Twilio signature (`PROVIDER=twilio`) | no/bad signature → 403; **independently-computed valid HMAC-SHA1 → 200** |

## Remaining risks & recommendations

1. **Auth is an MVP gate, not identity.** Add real accounts + tenant isolation before multi-customer use; scope every query by tenant.
2. **Webhook idempotency.** Add an `externalId` (or `(phone, source)` short-window) dedupe to prevent duplicate leads/calls on provider retries.
3. **Business-hours completeness.** Add a holiday/closed-dates table and overnight-window support; honor per-day timezones.
4. **Observability.** Thread `requestId` through provider calls and emit counters (leads received, routing failures by reason, webhook rejections); ship logs to a sink.
5. **Reconciliation job.** A periodic sweep to recover any `PENDING`/`BUSY` attempts older than N seconds (defense against host crashes between provider I/O and DB writes).
6. **Production hardening.** Run with `NODE_ENV=production`; add security headers in `next.config.mjs`; move the rate limiter to a shared store for multi-instance.

## Suggested next-sprint backlog

1. AuthN/AuthZ: accounts, roles (admin/agent), tenant isolation. (L)
2. Webhook idempotency keys + dedupe. (S)
3. Holiday calendar + overnight hours + per-day timezone. (M)
4. Lead queueing / callback when an agent frees (replaces fast-fail `NO_AGENT_AVAILABLE`). (M)
5. Lead detail page with full call timeline drill-down. (S)
6. Structured metrics + dashboard for routing failures and provider health. (M)
7. Toast/success feedback + remaining `aria-pressed`/contrast/label polish; IANA-timezone picker. (S)
8. Integration tests for `routeLead`/`handleTelephonyEvent` against a seeded test DB. (M)

## Blockers & assumptions

- **21st.dev Magic MCP unavailable** — no UI-generation tools were connected; UI work done by hand on the existing design system.
- **Named bespoke subagents** (codebase-mapper, backend-reviewer, etc.) **were not configured**; reviewer roles were simulated as isolated agent passes with separated outputs.
- **No live Twilio credentials / PSTN** — the Twilio path is validated by construction and signature unit/E2E tests, not a real call. The simulator validates the full flow end-to-end.
- **Branch:** work continued on `claude/lead-routing-happy-flow-nheoit` (the open PR #1 branch) rather than a separate `review-improvements-call-routing` branch, to keep the cycle attached to the PR. No production secrets, DB credentials, or deployment settings were modified; all new security controls are **opt-in and default-off** to preserve existing behavior.
