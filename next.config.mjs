/** @type {import('next').NextConfig} */

// Security headers applied to every response. The CSP intentionally allows
// 'unsafe-inline'/'unsafe-eval' (Next/React inject inline runtime code); it can
// be tightened to nonces later. The high-value wins here are frame-ancestors
// (clickjacking), nosniff, HSTS, and a strict referrer/permissions policy.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  // The Twilio SDK is Node-only and is imported lazily at runtime, only in
  // PROVIDER=twilio server route handlers. Keep it external to the Node.js
  // server bundle so it's required natively where it runs.
  //
  // IMPORTANT: do NOT do this via a global webpack `externals` entry — that also
  // injects a `twilio` reference into the Edge middleware bundle and fails the
  // build with: Edge Function "src/middleware" is referencing unsupported
  // modules: twilio. `serverExternalPackages` applies to the Node.js runtime
  // ONLY and leaves the Edge runtime (middleware) completely untouched.
  serverExternalPackages: ["twilio"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
