# RouteDesk — Connecting a Real Phone Number & Going to Production

This guide answers two questions:

1. **How do I connect an existing (virtual) phone number so the platform does real call routing?**
2. **What do I need to do to take this to production (Vercel and friends)?**

It is grounded in the actual code: the telephony layer lives behind one
`TelephonyProvider` interface (`src/lib/telephony/types.ts`) with a `simulator`
(default) and a wired-but-inactive `twilio` adapter (`src/lib/telephony/twilio.ts`).
Swapping providers does **not** touch the routing engine, state machine, dashboard,
or webhooks — only the adapter and a few env vars change.

---

## Status — what this branch already implements

Most of the hardening below has now been built and verified (tsc, 45/45 tests,
lint, `next build`, and runtime smoke all green):

- ✅ **Twilio adapter activated** — `callAgent`/`callLead`/`hangup` wired (lazy
  dynamic import); `npm run twilio:check` validates config + signatures safely.
- ✅ **Fail-closed auth** — in production, protected routes are denied (and the
  server refuses to boot via `validateEnv`) unless `DASHBOARD_PASSWORD` is set.
- ✅ **Webhook hardened** — constant-time secret compare, less-spoofable client
  IP, idempotency (`externalId` + 60s `(phone, source)` dedupe), and
  outbound-call **spend caps** (global/min + per-destination/hour).
- ✅ **Rate limiter** — Upstash Redis backend when configured (serverless-safe),
  bounded in-memory fallback.
- ✅ **Security headers** — CSP, HSTS, X-Frame-Options, nosniff, Referrer/Permissions.
- ✅ **Boot-time env validation**, **prod Prisma singleton**, `/api/telephony/sim/tick`
  gated, error/not-found boundaries, ESLint configured, activity `leadId` filter fixed.
- ✅ **Next.js upgraded 14 → 15.5** — clears all Next runtime advisories.

**Still required for a real production deploy (operator steps, below):**
provision **Postgres** (replace SQLite) + **Upstash**, set the env vars/secrets,
add `prisma migrate deploy`, and pin `PUBLIC_BASE_URL`. Multi-tenant accounts/RBAC
remain future work (the auth gate is a single shared password).

---

## Part A — Connect a real / existing virtual phone number

### A.0 How the calling actually works (so the config makes sense)

The platform does **agent-first dialing with a conference bridge**:

1. A lead arrives at `POST /api/webhook/lead` → routing picks the best agent.
2. The platform **calls the agent first**. The agent's call is told (via TwiML)
   to join a per-attempt conference room `room-<attemptId>`.
3. When the agent **answers**, the platform **calls the lead**, whose call joins
   the **same** conference room — that join *is* the bridge.
4. Status callbacks (`ringing/answered/busy/no-answer/completed/failed`) are POSTed
   back to the platform, normalized, and fed to the same `handleTelephonyEvent()`
   state machine the simulator uses. Outcomes are persisted and shown on the dashboard.

The number you connect is the **caller ID** the platform dials *from*
(`PLATFORM_CALLER_ID` / `TWILIO_NUMBER`). Both the agent leg and the lead leg are
**outbound** calls placed by the platform.

### A.1 Choose how your existing number reaches the platform

You said you already have a **virtual number**. There are three ways to use it:

| Option | When to use | What to do |
|---|---|---|
| **Port the number into Twilio** | You want one provider, full features, simplest code (the `twilio` adapter is already written) | Submit a port request in Twilio Console (Phone Numbers → Port). Takes a few business days. Once ported, set it as `TWILIO_NUMBER`. |
| **Keep the number where it is, use Twilio as the dialer with a verified caller ID** | You can't/won't port, but the carrier lets you verify outbound caller ID | In Twilio, add your number as a *Verified Caller ID*. Calls go out via Twilio but display your existing number. (Note: some destinations/carriers restrict spoofed caller ID; verify deliverability.) |
| **Build an adapter for your current carrier** | Your number lives on Vonage / Telnyx / Plivo / SignalWire / Bandwidth and you want to keep them | Implement a new `TelephonyProvider` (copy `twilio.ts`) using that carrier's SDK + webhooks, and register it in `getProvider()` (`src/lib/telephony/index.ts`). Same interface, ~the same 4 methods. |

**Recommendation:** unless you're committed to another carrier, **port (or verify) the
number into Twilio** — the adapter, signature verification, and webhook routes already
exist, so it's the fastest path to a working call.

### A.2 Enable the Twilio adapter (the happy path)

Everything below assumes Twilio. The adapter is at `src/lib/telephony/twilio.ts`;
the call/state plumbing, signature verification, and TwiML are already implemented —
you only fill in three SDK calls.

**1) Install the SDK**
```bash
npm install twilio
```

**2) Set environment variables** (see `.env.example`)
```bash
PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_NUMBER=+1XXXXXXXXXX        # your virtual number (the caller ID)
PUBLIC_BASE_URL=https://your-domain.com   # a public HTTPS URL Twilio can reach
PLATFORM_CALLER_ID=+1XXXXXXXXXX   # usually same as TWILIO_NUMBER
```
> `PUBLIC_BASE_URL` is critical: Twilio calls **into** your app at
> `PUBLIC_BASE_URL/api/telephony/twilio/voice` and `/status`, and the signature check
> reconstructs the URL from this value. If it doesn't *exactly* match the URL Twilio
> requested (scheme/host/path/query), every callback returns **403** and calls never
> progress. For local testing use an `ngrok` tunnel; in prod pin it to your real domain.

**3) Implement the three SDK calls** in `src/lib/telephony/twilio.ts`
(the bodies are already written as comments — uncomment and wire the client):

- `callAgent(params)` → `client.calls.create({ to: params.to, from: TWILIO_NUMBER, url: <voice URL>?attemptId=..&leg=agent, statusCallback: <status URL>?attemptId=..&leg=agent, statusCallbackEvent: ["initiated","ringing","answered","completed"] })` → return `{ providerCallSid: call.sid }`.
- `callLead(params)` → identical shape with `leg=lead`.
- `hangup(sid)` → `client.calls(sid).update({ status: "completed" })`.
- `bridge()` stays a no-op: the bridge is implicit because the lead's voice TwiML
  joins the agent's conference room (`conferenceTwiML()` is already correct).

**4) Confirm the webhook routes are reachable** (they already exist):
- `POST /api/telephony/twilio/voice` → returns the `<Conference>` TwiML.
- `POST /api/telephony/twilio/status` → receives leg status changes.
Both **verify `X-Twilio-Signature`** when `PROVIDER=twilio`. You generally don't need
to configure these in the Twilio Console because `calls.create` passes `url` +
`statusCallback` inline — but if you also point the *number's* Voice webhook at a URL,
use the same `/voice` endpoint.

**5) Make sure agents have real phone numbers.** Agent + lead numbers must be valid,
dialable E.164 (`+15551234567`). The webhook normalizes US 10-digit numbers to `+1…`
(`normalizePhone`), but for non-US numbers send full E.164 from the source.

### A.3 Test the integration

1. Local: run `ngrok http 3000`, set `PUBLIC_BASE_URL` to the tunnel URL, `PROVIDER=twilio`.
2. POST a lead with **your own mobile** as an agent's number and a second number as the lead:
   ```bash
   curl -X POST "$PUBLIC_BASE_URL/api/webhook/lead" \
     -H 'Content-Type: application/json' \
     -d '{"name":"Test Lead","phone":"+1<your-second-number>","source":"website"}'
   ```
3. Your "agent" phone should ring first; answer it; then the "lead" phone rings; answer it;
   you're bridged. Watch **Live Calls** on the dashboard advance through the same states.
4. Verify forged callbacks are rejected: a POST to `/api/telephony/twilio/status` without a
   valid `X-Twilio-Signature` must return **403**.

### A.4 Telephony go-live checklist
- [ ] Number ported/verified into Twilio (or adapter built for your carrier).
- [ ] `PROVIDER=twilio` + all `TWILIO_*` + `PUBLIC_BASE_URL` set in the deploy env.
- [ ] `npm install twilio`; the three `calls.create`/`hangup` bodies implemented.
- [ ] `PUBLIC_BASE_URL` exactly matches the public origin Twilio will call (no trailing slash).
- [ ] Agents’ phone numbers are valid E.164 and reachable.
- [ ] Test call completes end-to-end; forged callback returns 403.
- [ ] **Outbound-call spend caps + the security fixes in Part C are in place** (a public
      call-placing webhook is a toll-fraud target — do not expose it unprotected).

---

## Part B — Take it to production

### B.1 First decision: serverless (Vercel) vs. single long-lived container

The codebase was built as a **single Node process with SQLite**. That shape has three
assumptions that **do not hold on Vercel serverless**: a local SQLite file, an in-memory
rate-limiter, and an in-process timer (`ENABLE_SIM_TICKER`) plus poll-driven simulator clock.

| | **Single container** (Render / Railway / Fly.io / a VM) | **Vercel serverless** |
|---|---|---|
| Effort | **Low** — deploys close to as-is | **Medium** — must re-platform DB + rate limiter |
| Database | SQLite on a persistent disk works; Postgres recommended | **Must** use hosted Postgres (no local FS) |
| Rate limiter | In-memory is OK (one process) | **Must** move to Redis/Upstash (per-instance otherwise) |
| Simulator clock | Works (ticker / polls) | Doesn't advance hands-off — **but irrelevant in Twilio mode** |
| Telephony (Twilio) | Works | **Works** — Twilio webhooks push state, so no in-process timer needed |
| Best for | Fastest path to a real, calling deployment | Teams already standardized on Vercel |

> **Key nuance:** the simulator's sub-second timer is a *demo* mechanism. In **production
> with Twilio**, real status callbacks drive the state machine, so the ticker/poll limitation
> (the main serverless blocker for the *demo*) **goes away**. Your real blockers on Vercel are
> the **database** and the **rate limiter**.

**Recommendation:** for the quickest path to a live, call-routing product, deploy as a
**single container on Railway/Render/Fly with Postgres**. Choose **Vercel** if you want
serverless ergonomics and are willing to do the Postgres + Upstash swap below.

### B.2 Production changes — required for either host

These were flagged by the functionality, security, and prod-readiness review passes.

**1) Database — Postgres (operator step; tooling is built in).** ✅ The committed
schema stays SQLite so local dev/tests/the demo run with zero config; the build
auto-generates a **PostgreSQL** Prisma client whenever `DATABASE_URL` is a
`postgres(ql)://` URL — one source of truth (`prisma/schema.prisma`), no manual edits
(`scripts/prisma-prepare.mjs` + `scripts/build-prisma-schema.mjs`). To stand up prod:
- Provision hosted Postgres (**Neon**, **Vercel Postgres**, or **Supabase**) and use a
  **pooled** connection string (PgBouncer / Neon pooler / Prisma Accelerate).
- Create the tables: `DATABASE_URL=<postgres-url> npm run db:push:prod`
  (optionally `npm run db:seed:prod`). _Verified: the generated Postgres schema
  validates and `next build` compiles against a Postgres `DATABASE_URL`._

**2) Migrations (optional upgrade over `db push`).** `db:push:prod` creates the schema
directly (fine for an MVP). For migration history, create a `migrations/` folder
(`prisma migrate dev --name init`) and run `npm run db:migrate:prod`
(= `prisma migrate deploy` against the generated Postgres schema) on release.

**3) Rate limiter — set Upstash (operator step).** ✅ The limiter already uses Upstash
Redis when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set (bounded in-memory fallback
otherwise). Provision an Upstash database and set those two vars.

**4) Already implemented:** ✅ Prisma client cached in prod (`src/lib/db.ts`),
✅ boot-time env validation that refuses to boot on misconfig (`validateEnv`),
✅ security headers (`next.config.mjs`), ✅ `error.tsx`/`global-error.tsx`/`not-found.tsx`,
✅ Next.js 15 (advisories cleared).

**5) Pin `PUBLIC_BASE_URL`** to the canonical production domain (Part A) — Vercel preview
URLs change per deploy and will break Twilio signature verification.

**6) Turn the security controls ON** — set `DASHBOARD_PASSWORD` and (in Twilio mode)
`LEAD_WEBHOOK_SECRET`. In production the app now **refuses to boot** without them.

### B.3 Deploying on Vercel (step-by-step)

1. Provision Postgres (Neon/Vercel Postgres) and run `DATABASE_URL=<url> npm run db:push:prod`.
2. Provision Upstash Redis (note the REST URL + token).
3. In **Vercel → Project → Settings → Environment Variables**, set:
   `DATABASE_URL` (pooled Postgres), `PROVIDER=twilio`, `TWILIO_ACCOUNT_SID/AUTH_TOKEN/NUMBER`,
   `PUBLIC_BASE_URL` (= your prod domain), `PLATFORM_CALLER_ID`, `DASHBOARD_PASSWORD`,
   `LEAD_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. **Do not**
   set `ENABLE_SIM_TICKER`.
4. Build command stays the default `npm run build` — it detects the Postgres
   `DATABASE_URL` and generates the matching Prisma client automatically.
5. Point your number's Twilio config / `calls.create` at `https://<prod-domain>/api/telephony/twilio/*`.
6. Deploy; smoke-test the webhook + a real call; confirm the dashboard requires auth and
   `npm run twilio:check` passes.

### B.4 Deploying as a single container (simplest for telephony)

1. Use **Railway / Render / Fly.io**. Add a Postgres add-on (or a persistent volume if you
   keep SQLite for a small single-tenant deploy).
2. Set the same env vars as B.3 (you *may* set `ENABLE_SIM_TICKER=1` only if you stay on the
   simulator; leave it off for Twilio).
3. Optional: `output: 'standalone'` in `next.config.mjs` for a slim Docker image.
4. Start with `prisma migrate deploy && npm run build && npm run start`.

### B.5 Environment variable reference

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres (pooled) in prod; SQLite only for local/single-tenant container |
| `PROVIDER` | yes | `simulator` (demo) or `twilio` (real calls) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_NUMBER` | if Twilio | from Twilio Console |
| `PUBLIC_BASE_URL` | if Twilio | canonical public HTTPS origin; must match Twilio's request URL exactly |
| `PLATFORM_CALLER_ID` | yes | caller ID dialed from (usually `TWILIO_NUMBER`) |
| `DASHBOARD_PASSWORD` | **prod: yes** | enables the Basic-auth gate on the dashboard + admin APIs |
| `LEAD_WEBHOOK_SECRET` | **prod: yes** | required token on the public lead webhook |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | prod (multi-instance) | shared rate-limit store |
| `ENABLE_SIM_TICKER` | no | single-container + simulator only; never on serverless/Twilio |

---

## Part C — Security status & remaining items

The audit's blockers have largely been implemented on this branch. **The controls
still default to OFF for the local demo, but production now fails closed** (the
server won't boot without `DASHBOARD_PASSWORD`, and a real-call deploy requires
`LEAD_WEBHOOK_SECRET`).

| # | Item | Status |
|---|------|--------|
| 1 | Fail-closed auth (deny + refuse-boot when no `DASHBOARD_PASSWORD` in prod) | ✅ done (`src/middleware.ts`, `validateEnv`) |
| 2 | Lock down call-placing webhook: required secret in Twilio mode + outbound-call caps | ✅ done (`webhook/lead`, `env.callCaps`) — set a **daily spend ceiling in Twilio** too |
| 3 | Rate-limit: less-spoofable IP + shared Redis store | ✅ done (`rateLimit.ts`, Upstash when configured) |
| 4 | Constant-time webhook-secret compare | ✅ done (`safeCompare.ts`) |
| 5 | Webhook idempotency/dedupe | ✅ done (`externalId` + `(phone, source)` window) |
| 6 | Security headers (CSP, HSTS, frame-ancestors, …) | ✅ done (`next.config.mjs`) |
| 7 | Upgrade Next.js off 14.2.x advisories | ✅ done (→ 15.5; 0 Next advisories) |
| 8 | Gate `/api/telephony/sim/tick`; keep Twilio signature checks always-on | ✅ tick gated; signature check verified |
| 9 | **Multi-tenant accounts + RBAC** (the gate is one shared password) | ⬜ future work |
| 10 | **Set a Twilio account spend limit / alerts** as a backstop to the app caps | ⬜ operator step |
| 11 | Tighten CSP to nonces (currently allows `unsafe-inline`/`unsafe-eval`) | ⬜ hardening follow-up |

---

## TL;DR

- **The platform works end-to-end today** (simulator): 36/36 tests, clean build, the full
  agent-first → bridge → outcome flow verified over HTTP.
- **To make real calls:** port/verify your number into **Twilio**, set `PROVIDER=twilio` +
  `TWILIO_*` + `PUBLIC_BASE_URL`, `npm install twilio`, and fill in the three pre-written
  `calls.create`/`hangup` bodies in `src/lib/telephony/twilio.ts`. Nothing else changes.
- **To go to production:** easiest is a **single container (Railway/Render/Fly) + Postgres**.
  For **Vercel**, you additionally must move to **Postgres** and an **Upstash** rate limiter
  (the simulator's in-process timer is a demo-only concern and irrelevant once Twilio drives
  the state machine).
- **Before exposing it publicly:** do the Part C security fixes — above all, turn on auth and
  protect the call-placing webhook with a secret + spend caps.
