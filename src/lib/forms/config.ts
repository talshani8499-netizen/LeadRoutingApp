import { prisma } from "@/lib/db";
import { CANONICAL_FIELDS, type CanonicalField } from "@/lib/leadIntake";

// Effective form-connection config: the persisted singleton row (Settings ->
// Connect Forms) with safe fallbacks. Mirrors getTelephonyConfig — safe if the
// table doesn't exist yet (returns empty defaults).

export interface FormsConfig {
  defaultSource: string;
  /** theirFieldName -> canonical field. */
  fieldMap: Record<string, CanonicalField>;
  source: "db" | "default";
}

/** Parse the stored fieldMap JSON, keeping only valid canonical targets. */
export function parseFieldMap(raw: string | null | undefined): Record<string, CanonicalField> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, CanonicalField> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && CANONICAL_FIELDS.includes(v as CanonicalField)) {
        out[k] = v as CanonicalField;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function getFormsConfig(): Promise<FormsConfig> {
  let row: Awaited<ReturnType<typeof prisma.formConfig.findUnique>> = null;
  try {
    row = await prisma.formConfig.findUnique({ where: { id: "default" } });
  } catch {
    row = null;
  }
  return {
    defaultSource: row?.defaultSource?.trim() || "",
    fieldMap: parseFieldMap(row?.fieldMap),
    source: row ? "db" : "default",
  };
}
