import { NextRequest, NextResponse } from "next/server";

// Optional, opt-in access gate.
//
// When DASHBOARD_PASSWORD is set, the dashboard and admin APIs require HTTP
// Basic auth. The public telephony webhooks are intentionally excluded — they
// carry their own verification (a shared secret on the lead webhook and an
// X-Twilio-Signature check on the Twilio callbacks). When DASHBOARD_PASSWORD is
// unset (the default), everything passes through unchanged so the local demo
// needs no configuration.

const PUBLIC_PATHS = [
  "/api/webhook/lead",
  "/api/telephony/twilio/voice",
  "/api/telephony/twilio/status",
];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RouteDesk", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  if (!password) return NextResponse.next(); // gate disabled — preserve demo behavior

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
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
  if (!timingSafeEqual(supplied, password)) return unauthorized();

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
