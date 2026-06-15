// Small typed accessor for environment configuration so the rest of the app
// never reads process.env directly.

export const env = {
  provider: (process.env.PROVIDER ?? "simulator") as "simulator" | "twilio",
  platformCallerId: process.env.PLATFORM_CALLER_ID ?? "+15555550123",
  enableSimTicker: process.env.ENABLE_SIM_TICKER === "1",

  // Optional, opt-in security controls. All default to "off" so the local demo
  // keeps working with zero config; set them to harden a real deployment.
  // - dashboardPassword: when set, Basic-auth gates the dashboard + admin APIs.
  // - leadWebhookSecret: when set, /api/webhook/lead requires this token.
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? "",
  leadWebhookSecret: process.env.LEAD_WEBHOOK_SECRET ?? "",

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    number: process.env.TWILIO_NUMBER ?? "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  },
};
