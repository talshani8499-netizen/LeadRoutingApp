import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Translate errors thrown inside route handlers into safe responses. Prisma's
// known error codes map to clean client statuses; anything else becomes a
// generic 500 so internal details (queries, stack traces) never reach clients.

interface PrismaKnownError {
  code: string;
  meta?: unknown;
}

function isPrismaKnownError(err: unknown): err is PrismaKnownError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("P")
  );
}

export function apiError(event: string, err: unknown): NextResponse {
  if (isPrismaKnownError(err)) {
    if (err.code === "P2025") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (err.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "A record with that value already exists" },
        { status: 409 },
      );
    }
    if (err.code === "P2003") {
      return NextResponse.json(
        { ok: false, error: "Record is still referenced and cannot be deleted" },
        { status: 409 },
      );
    }
  }
  logger.error(event, { error: err instanceof Error ? err.message : String(err) });
  return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
}
