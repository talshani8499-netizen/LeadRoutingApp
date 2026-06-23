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

**1) Move off SQLite to Postgres** (mandatory on Vercel; recommended everywhere)
- `prisma/schema.prisma`: `datasource db { provider = "postgresql" }`.
- Use a hosted Postgres: **Neon**, **Vercel Postgres**, or **Supabase**.
- Use a **pooled** connection (PgBouncer / Neon pooler / Prisma Accelerate) — serverless
  opens many short-lived connections.
- The string-enum columns port as-is (they're already plain `String`).

**2) Adopt real migrations** (today the project only uses `prisma db push`)
- Generate an initial migration and run `prisma migrate deploy` on release:
  ```bash
  npx prisma migrate dev --name init      # once, locally, to create migrations/
  # release step:
  npx prisma migrate deploy
  ```
- Without this, a fresh prod DB has **no tables** and every query 500s.

**3) Externalize the rate limiter** (`src/lib/rateLimit.ts`)
- Replace the in-memory `Map` with **Upstash Redis** (or a WAF/provider limit).
- On multi-instance/serverless the in-memory limit is per-instance and resets on cold
  start, so the toll-fraud brake on the public webhook is effectively absent.

**4) Make the Prisma client a singleton in prod** (`src/lib/db.ts:15`)
- Currently cached on `globalThis` only when `NODE_ENV !== "production"`. Cache it
  unconditionally to avoid connection exhaustion.

**5) Add boot-time env validation** (`src/lib/env.ts`)
- Validate with zod at startup; **fail fast** if `PROVIDER=twilio` but `TWILIO_*` /
  `PUBLIC_BASE_URL` are missing, and assert `DATABASE_URL`. Today a misconfigured deploy
  boots "healthy" and only 500s on the first call.

**6) Add security headers** (`next.config.mjs`)
- Add an `async headers()` block: `Strict-Transport-Security`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a CSP.

**7) Add error/҂not-found boundaries**
- Create `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx` so a
  render error shows a recovery UI instead of a bare "Application error".

**8) Pin `PUBLIC_BASE_URL`** to the canonical production domain (Part A) — Vercel preview
URLs change per deploy and will break Twilio signature verification.

**9) Turn the security controls ON** (they default to OFF — see Part C).

### B.3 Deploying on Vercel (step-by-step)

1. Provision Postgres (Neon/Vercel Postgres) and apply changes B.2/1, B.2/2.
2. Provision Upstash Redis and swap the rate limiter (B.2/3).
3. In **Vercel → Project → Settings → Environment Variables**, set:
   `DATABASE_URL` (pooled), `PROVIDER`, `TWILIO_ACCOUNT_SID/AUTH_TOKEN/NUMBER`,
   `PUBLIC_BASE_URL` (= your prod domain), `PLATFORM_CALLER_ID`, `DASHBOARD_PASSWORD`,
   `LEAD_WEBHOOK_SECRET`, `UPSTASH_REDIS_*`. **Do not** set `ENABLE_SIM_TICKER`.
4. Build command stays `prisma generate && next build`; add `prisma migrate deploy` to a
   release/post-deploy step.
5. Point your number's Twilio config / `calls.create` at `https://<prod-domain>/api/telephony/twilio/*`.
6. Deploy; smoke-test the webhook + a real call; confirm the dashboard requires auth.

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

## Part C — Security must-fixes before public exposure

The full audit is summarized in the chat brief; these are the blockers. **All security
controls currently default to OFF**, so a default deploy has no auth and an open,
call-placing webhook.

1. **Fail-closed auth.** Today the dashboard + all admin APIs are unauthenticated unless
   `DASHBOARD_PASSWORD` is set (`src/middleware.ts`). For production: refuse to boot (or
   deny by default) when no auth is configured, and plan real accounts + per-tenant scoping
   before multi-customer use.
2. **Lock down the call-placing webhook** (`src/app/api/webhook/lead/route.ts`). It triggers
   real outbound calls to attacker-supplied numbers → toll-fraud/robo-dial. Require
   `LEAD_WEBHOOK_SECRET` whenever `PROVIDER!=simulator`, and add **global + per-destination
   outbound-call caps and a daily spend ceiling**.
3. **Fix the rate-limit key + store.** It keys on the spoofable `X-Forwarded-For` left value
   and is in-memory. Derive the IP from the trusted proxy hop and move to Redis (B.2/3).
4. **Constant-time secret compare** for `LEAD_WEBHOOK_SECRET` (the webhook uses `!==`;
   the dashboard and Twilio paths already use constant-time — reuse that).
5. **Add idempotency/dedupe** on lead intake (e.g. an `externalId` or short-window
   `(phone, source)` key) so retried/replayed webhooks don't create duplicate leads & calls.
6. **Security headers** (B.2/6).
7. **Upgrade Next.js** off `14.2.35` (open DoS / App-Router advisories from `npm audit`).
8. **Gate `/api/telephony/sim/tick`** (a public simulator-progression endpoint) and keep
   Twilio signature checks always-on.

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
