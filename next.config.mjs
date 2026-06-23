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
  experimental: {
    // Enables src/instrumentation.ts (env validation + the optional sim ticker).
    instrumentationHook: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack: (config) => {
    // The Twilio SDK is a Node-only package, loaded lazily at runtime and only in
    // server route handlers (PROVIDER=twilio). Mark it external so webpack never
    // bundles it — bundling pulls in Node built-ins (crypto via jsonwebtoken)
    // that break the Edge build. It's required natively where it actually runs.
    if (Array.isArray(config.externals)) {
      config.externals.push({ twilio: "commonjs twilio" });
    } else {
      config.externals = [config.externals, { twilio: "commonjs twilio" }].filter(Boolean);
    }
    return config;
  },
};

export default nextConfig;
