// Next.js instrumentation entry. This module is compiled for BOTH the Node.js
// and Edge runtimes, so it must not statically (or via an unconditional dynamic
// import) pull Node-only code into the Edge bundle. The telephony stack reaches
// the Twilio SDK, which needs Node's `crypto` — bundling that into Edge fails the
// build ("Edge Function is referencing unsupported modules: twilio").
//
// So all Node-only work lives in ./instrumentation-node and is imported ONLY when
// running on Node. Next.js evaluates `process.env.NEXT_RUNTIME` at build time, so
// in the Edge build this branch is dead code and the import (with its telephony/
// Twilio dependencies) is excluded entirely.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
