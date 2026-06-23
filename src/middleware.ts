import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqualStr } from "@/lib/safeCompare";

// Access gate for the dashboard + admin APIs.
//
// When DASHBOARD_PASSWORD is set, those routes require HTTP Basic auth. The
// public telephony webhooks are always excluded — they carry their own
// verification (a shared secret on the lead webhook and an X-Twilio-Signature
// check on the Twilio callbacks).
//
// When DASHBOARD_PASSWORD is UNSET:
//   - in development the gate stays open so the local demo needs no config;
//   - in production it FAILS CLOSED (503) so a deploy is never silently exposing
//     all lead PII + routing control to the internet.

const PUBLIC_PATHS = [
  "/api/webhook/lead",
  "/api/telephony/twilio/voice",
  "/api/telephony/twilio/status",
];

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RouteDesk", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD ?? "";
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed: refuse protected routes until an operator sets a password.
      return new NextResponse(
        "Server not configured: set DASHBOARD_PASSWORD to enable the dashboard.",
        { status: 503 },
      );
    }
    return NextResponse.next(); // dev/demo convenience only
  }

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }
  // Format is "user:password"; we only check the password.
  const supplied = decoded.slice(decoded.indexOf(":") + 1);
  if (!timingSafeEqualStr(supplied, password)) return unauthorized();

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
