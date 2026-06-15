# RouteDesk — Lead Routing App

Routes inbound leads to the right agent and connects the call instantly. Built
for SMBs as a Next.js (App Router) + TypeScript full-stack app with Prisma +
SQLite and a clean, real-time dashboard.

It implements the full happy-flow:

1. A customer fills out a form → the lead is sent to a **webhook**.
2. The backend **validates** the lead.
3. Business rules are evaluated: **business hours, agent availability, lead
   source settings, routing rules**.
4. The **most appropriate available agent** is selected.
5. The platform **calls the agent first** (agent-first dialing).
6. When the agent answers, the system **calls the lead**.
7. When the lead answers, **both calls are bridged**.
8. Call results + lead status are recorded: **Connected / No Answer / Busy /
   Failed** (and *No agent available*).
9. Everything is **logged in the dashboard** for reporting and analytics.

## The one technical caveat (reviewed, not taken for granted)

Steps 5–7 — *call agent → call lead → bridge both legs* — require a real
telephony carrier (Twilio/Vonage), a purchased number, live credentials, and a
publicly reachable webhook URL. None of that exists in a local/ephemeral
environment, so calling is built behind a **pluggable telephony adapter**:

- **`simulator`** (default) — drives the entire flow with realistic, timed,
  randomized outcomes. **No credentials needed.** This is what makes the whole
  app demoable end-to-end out of the box.
- **`twilio`** — a wired, documented adapter (`src/lib/telephony/twilio.ts`)
  showing exactly how the real provider maps onto the same interface
  (`calls.create` + `statusCallback` webhooks + TwiML `<Conference>` bridging).
  Inactive until you set `PROVIDER=twilio` and the `TWILIO_*` env vars.

Both providers emit the same normalized events into a single
`handleTelephonyEvent()` that advances a persisted state machine — so the
simulator and Twilio are structurally identical, and all call state lives in the
database (never in memory), which is what makes it correct under Next.js's
stateless route handlers.

## Quick start

```bash
npm install
cp .env.example .env          # defaults are fine (PROVIDER=simulator)
npx prisma db push            # create the SQLite schema
npm run db:seed               # demo agents, sources, rules, business hours
npm run dev                   # http://localhost:3000  → /dashboard
```

Then click **“Simulate lead”** in the top bar (or POST the webhook directly):

```bash
curl -X POST http://localhost:3000/api/webhook/lead \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","phone":"+12025550100","source":"website"}'
```

Open **Live Calls** and watch the attempt move through
`Calling agent → Agent connected → Calling lead → Connected`.

> **How real-time works:** polling `/api/calls/active` (which the dashboard does
> every ~1.5s) advances the simulator, so simply watching the page drives the
> flow. For hands-off progression set `ENABLE_SIM_TICKER=1` (single-container
> only) to run an in-process 1s ticker.

## Dashboard

- **Overview** — leads today, active calls, connect rate, agent availability,
  call-outcome breakdown, agent leaderboard, lead pipeline.
- **Live Calls** — real-time agent-first dialing pipeline + recent outcomes.
- **Leads** — every inbound lead and its routing result.
- **Agents** — availability, priority, skills (drive routing); add/deactivate.
- **Settings** — Lead Sources, Routing Rules (round-robin / priority /
  skill-based, with agent-fallback `maxAttempts`), and Business Hours
  (per-timezone weekly schedule, overnight windows that wrap past midnight, and
  a holiday calendar with one-off and recurring closed dates).

## Architecture

```
src/lib/
  db.ts                  Prisma singleton
  enums.ts               value sets (SQLite stores enums as strings)
  validation.ts          zod schemas for webhook + CRUD
  activity.ts            activity-log helper (audit trail)
  analytics.ts           dashboard aggregations
  telephony/
    types.ts             TelephonyProvider interface + normalized event
    events.ts            handleTelephonyEvent — the single state-mutation path
    simulator.ts         default provider (persisted, timed transitions)
    twilio.ts            real adapter (wired, inactive)
    tick.ts              applies due simulator transitions
    index.ts             getProvider() factory (PROVIDER env)
  routing/
    engine.ts            routeLead / startAttempt / dispatchLead + agent pick
    stateMachine.ts      pure transition table (unit-tested)
    businessHours.ts     timezone-aware hours check (unit-tested)
src/app/
  api/…                  webhook, telephony callbacks, calls, CRUD, analytics
  dashboard/…            overview, activity, leads, agents, settings pages
```

## Tests

```bash
npm test      # vitest: state machine, business hours, agent selection
```

## Enabling real calls (Twilio)

1. `npm install twilio`
2. Set in `.env`: `PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_NUMBER`, and `PUBLIC_BASE_URL` (a public HTTPS URL Twilio can reach,
   e.g. an ngrok tunnel).
3. Implement the commented `calls.create(...)` / `hangup` bodies in
   `src/lib/telephony/twilio.ts` (the mapping and TwiML are already written).

The routing engine, state machine, dashboard, and webhooks are unchanged — only
the provider swaps.
