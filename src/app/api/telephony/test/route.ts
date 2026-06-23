import { NextResponse } from "next/server";
import { getTelephonyConfig } from "@/lib/telephony/config";

export const dynamic = "force-dynamic";

// Validate the saved Twilio credentials by fetching the account from Twilio's
// REST API. Places no call. Returns ok:false (200) for a clean credential
// failure so the UI can show a friendly message rather than throwing.
export async function POST() {
  const cfg = await getTelephonyConfig();

  if (cfg.provider !== "twilio") {
    return NextResponse.json(
      { ok: false, error: "Provider is set to Simulator. Switch to Twilio and save first." },
      { status: 400 },
    );
  }
  const { accountSid, authToken, number, publicBaseUrl } = cfg.twilio;
  if (!accountSid || !authToken) {
    return NextResponse.json(
      { ok: false, error: "Missing Account SID or Auth Token." },
      { status: 400 },
    );
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    if (res.status === 401) {
      return NextResponse.json(
        { ok: false, error: "Twilio rejected these credentials (401). Check the SID and auth token." },
        { status: 200 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Twilio API returned ${res.status}.` },
        { status: 200 },
      );
    }

    const acct = (await res.json()) as { friendly_name?: string; status?: string };
    const warnings: string[] = [];
    if (!number) warnings.push("No phone number set — add your Twilio number to place calls.");
    if (!publicBaseUrl) warnings.push("No public base URL set — Twilio callbacks won't reach the app.");

    return NextResponse.json({
      ok: true,
      accountName: acct.friendly_name || "Twilio account",
      accountStatus: acct.status || "active",
      warnings,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not reach Twilio. Check network/credentials and try again." },
      { status: 200 },
    );
  }
}
