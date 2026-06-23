import { NextRequest, NextResponse } from "next/server";
import { countDemo, loadDemoData, clearDemoData } from "@/lib/demo";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

// Demo ("mock") data controls for Settings -> Demo Data. GET returns how much
// demo data is loaded; POST {action:"load"|"clear"} populates or removes it.
export async function GET() {
  try {
    return NextResponse.json({ ok: true, counts: await countDemo() });
  } catch (err) {
    return apiError("demo.status_failed", err);
  }
}

export async function POST(req: NextRequest) {
  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body -> falls through to the 400 below */
  }

  try {
    if (body.action === "load") {
      return NextResponse.json({ ok: true, action: "load", counts: await loadDemoData() });
    }
    if (body.action === "clear") {
      await clearDemoData();
      return NextResponse.json({ ok: true, action: "clear", counts: await countDemo() });
    }
    return NextResponse.json(
      { ok: false, error: "Unknown action — use 'load' or 'clear'." },
      { status: 400 },
    );
  } catch (err) {
    return apiError("demo.action_failed", err);
  }
}
