/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Enables src/instrumentation.ts (the optional simulator ticker) on Next 14.
    instrumentationHook: true,
  },
};

export default nextConfig;
