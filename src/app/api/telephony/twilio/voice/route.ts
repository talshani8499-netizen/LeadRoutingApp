import { NextRequest } from "next/server";
import { conferenceTwiML } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";

// Returns the TwiML that drops a call leg into the shared per-attempt
// conference room. Twilio fetches this URL when each leg is answered.
// Inactive in v1 (PROVIDER=simulator) but wired and ready.
export async function POST(req: NextRequest) {
  const attemptId = req.nextUrl.searchParams.get("attemptId") ?? "unknown";
  const xml = conferenceTwiML(`room-${attemptId}`);
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
