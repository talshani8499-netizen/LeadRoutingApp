/**
 * Twilio integration smoke test — SAFE BY DEFAULT.
 *
 * A config/wiring validator for the Twilio telephony adapter. It checks env
 * configuration, constructs the provider, self-tests the webhook signature
 * verifier, and prints the exact REST payload that WOULD be sent — all WITHOUT
 * placing any real phone call.
 *
 * Run:
 *   npx tsx scripts/twilio-smoke-test.ts          # safe, no calls placed
 *   TEST_TO=+15551234567 npx tsx scripts/twilio-smoke-test.ts --live   # places ONE real call
 *
 * Exits 0 on success, non-zero if any validation step fails.
 */

import { createHmac } from "node:crypto";
import { env } from "../src/lib/env";
import {
  TwilioProvider,
  conferenceTwiML,
  isValidTwilioSignature,
} from "../src/lib/telephony/twilio";

// ----------------------------------------------------------------------------
// Tiny console helpers (no external deps).
// ----------------------------------------------------------------------------

let failures = 0;

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function pass(msg: string): void {
  console.log(`  [PASS] ${msg}`);
}

function fail(msg: string): void {
  failures++;
  console.log(`  [FAIL] ${msg}`);
}

function info(msg: string): void {
  console.log(`  ${msg}`);
}

// ----------------------------------------------------------------------------
// Step 1 — environment / configuration check.
// ----------------------------------------------------------------------------

function checkEnv(): void {
  section("1. Environment configuration");

  if (env.provider === "twilio") {
    pass(`PROVIDER is "twilio"`);
  } else {
    fail(`PROVIDER is "${env.provider}" (expected "twilio")`);
  }

  const required: Record<string, string> = {
    TWILIO_ACCOUNT_SID: env.twilio.accountSid,
    TWILIO_AUTH_TOKEN: env.twilio.authToken,
    TWILIO_NUMBER: env.twilio.number,
    PUBLIC_BASE_URL: env.twilio.publicBaseUrl,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length === 0) {
    pass("All required vars are set: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER, PUBLIC_BASE_URL");
  } else {
    fail(`Missing required env var(s): ${missing.join(", ")}`);
  }
}

// ----------------------------------------------------------------------------
// Step 2 — construct the provider.
// ----------------------------------------------------------------------------

function checkConstructor(): TwilioProvider | null {
  section("2. Provider construction");
  try {
    const provider = new TwilioProvider();
    pass(`TwilioProvider constructed (name="${provider.name}")`);
    return provider;
  } catch (err) {
    fail(`TwilioProvider constructor threw: ${(err as Error).message}`);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Step 3 — self-test isValidTwilioSignature.
//
// Recompute Twilio's canonical signature (HMAC-SHA1 over url + sorted k+v,
// base64) with a sample token, assert the verifier accepts it, then assert a
// tampered signature is rejected.
// ----------------------------------------------------------------------------

function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

async function checkSignatureSelfTest(): Promise<void> {
  section("3. Webhook signature self-test (isValidTwilioSignature)");

  const sampleToken = "smoke-test-auth-token-0123456789";
  const sampleUrl = "https://example.com/api/telephony/twilio/status?attemptId=abc&leg=agent";
  const sampleParams: Record<string, string> = {
    CallSid: "CA00000000000000000000000000000000",
    CallStatus: "completed",
    From: "+15555550123",
    To: "+15557654321",
  };

  const validSig = twilioSignature(sampleToken, sampleUrl, sampleParams);

  const acceptsValid = await isValidTwilioSignature(sampleToken, validSig, sampleUrl, sampleParams);
  if (acceptsValid) {
    pass("Correct signature is accepted");
  } else {
    fail("Correct signature was REJECTED (verifier disagrees with reference HMAC)");
  }

  // Tamper: flip the first character to a different base64 char, same length.
  const tamperedSig = (validSig[0] === "A" ? "B" : "A") + validSig.slice(1);
  const acceptsTampered = await isValidTwilioSignature(
    sampleToken,
    tamperedSig,
    sampleUrl,
    sampleParams,
  );
  if (!acceptsTampered) {
    pass("Tampered signature is rejected");
  } else {
    fail("Tampered signature was ACCEPTED (verification is broken)");
  }

  // An empty token or signature must always be rejected.
  const emptyRejected =
    !(await isValidTwilioSignature("", validSig, sampleUrl, sampleParams)) &&
    !(await isValidTwilioSignature(sampleToken, "", sampleUrl, sampleParams));
  if (emptyRejected) {
    pass("Empty token / empty signature are rejected");
  } else {
    fail("Empty token or signature was accepted");
  }
}

// ----------------------------------------------------------------------------
// Step 4 — print TwiML + the exact calls.create payload (dry run, no send).
// ----------------------------------------------------------------------------

function printDryRunPayload(): void {
  section("4. Dry run — TwiML + calls.create payload (NOT sent)");

  const sampleAttemptId = "attempt-demo-123";
  const base = env.twilio.publicBaseUrl || "<PUBLIC_BASE_URL unset>";

  info("conferenceTwiML(\"room-demo\"):");
  console.log(
    conferenceTwiML("room-demo")
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
  );

  // Mirror exactly what TwilioProvider.placeCall builds for the agent leg.
  const encodedAttemptId = encodeURIComponent(sampleAttemptId);
  const leg = "agent";
  const payload = {
    to: "+15557654321",
    from: env.twilio.number || "<TWILIO_NUMBER unset>",
    url: `${base}/api/telephony/twilio/voice?attemptId=${encodedAttemptId}&leg=${leg}`,
    statusCallback: `${base}/api/telephony/twilio/status?attemptId=${encodedAttemptId}&leg=${leg}`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
  };

  info("calls.create(...) payload that WOULD be sent for a sample agent leg:");
  console.log(
    JSON.stringify(payload, null, 2)
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
  );
}

// ----------------------------------------------------------------------------
// Step 5 — OPTIONAL live call (guarded by --live AND TEST_TO).
// ----------------------------------------------------------------------------

async function maybePlaceLiveCall(provider: TwilioProvider | null): Promise<void> {
  section("5. Live call (optional)");

  const live = process.argv.includes("--live");
  const testTo = process.env.TEST_TO ?? "";

  if (!live) {
    info("Skipped: pass --live to place a real call.");
    return;
  }
  if (!testTo) {
    fail("--live was passed but TEST_TO is not set. Refusing to place a call. Set TEST_TO=+1...");
    return;
  }
  if (!provider) {
    fail("--live requested but the provider failed to construct; cannot place a call.");
    return;
  }

  info(`!!! LIVE MODE: placing ONE real call to ${testTo} via callAgent() ...`);
  try {
    const result = await provider.callAgent({
      attemptId: `smoke-${Date.now()}`,
      leg: "agent",
      to: testTo,
      from: env.twilio.number,
    });
    pass(`Call placed. providerCallSid = ${result.providerCallSid}`);
  } catch (err) {
    fail(`Live call failed: ${(err as Error).message}`);
  }
}

// ----------------------------------------------------------------------------
// Runner.
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Twilio smoke test — SAFE by default (no calls placed unless --live + TEST_TO).");

  checkEnv();
  const provider = checkConstructor();
  await checkSignatureSelfTest();
  printDryRunPayload();
  await maybePlaceLiveCall(provider);

  section("Result");
  if (failures === 0) {
    console.log("  All checks passed. ✓");
    process.exit(0);
  } else {
    console.log(`  ${failures} check(s) failed. ✗`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nUnexpected error in smoke test:", err);
  process.exit(1);
});
