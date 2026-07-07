import type { NextRequest } from "next/server";

// Turns the messy, varied payloads that real lead forms send into the canonical
// fields the routing engine understands. Two concerns:
//   1) parseInboundBody  — accept JSON, x-www-form-urlencoded and multipart.
//   2) mapLeadFields     — alias arbitrary field names to name/phone/email/etc,
//                          with an optional user-defined custom map on top.

export type CanonicalField = "name" | "phone" | "email" | "source" | "notes" | "externalId";

export const CANONICAL_FIELDS: CanonicalField[] = [
  "name",
  "phone",
  "email",
  "source",
  "notes",
  "externalId",
];

// Accepted incoming field names per canonical field, already NORMALIZED
// (lowercased, non-alphanumerics stripped) so "Full Name", "full_name" and
// "full-name" all collapse to the same token.
export const BUILT_IN_ALIASES: Record<CanonicalField, string[]> = {
  name: ["name", "fullname", "yourname", "contactname", "leadname", "customername", "clientname"],
  phone: [
    "phone", "phonenumber", "tel", "telephone", "mobile", "mobilenumber", "mobilephone",
    "cell", "cellphone", "yourphone", "contactnumber", "contactphone", "whatsapp",
  ],
  email: ["email", "emailaddress", "youremail", "contactemail", "mail", "emailid"],
  source: ["source", "leadsource", "utmsource", "formname", "form", "campaign", "channel"],
  notes: [
    "notes", "note", "message", "messages", "comment", "comments", "inquiry", "enquiry",
    "details", "question", "questions", "description", "howcanwehelp", "additionalinfo", "reason",
  ],
  externalId: [
    "externalid", "submissionid", "leadid", "leadgenid", "entryid", "responseid", "recordid", "id",
  ],
};

const FIRST_NAME_KEYS = ["firstname", "fname", "givenname", "first"];
const LAST_NAME_KEYS = ["lastname", "lname", "surname", "familyname", "last"];

/** Collapse a field name to a comparison token: lowercase, alphanumerics only. */
export function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Shallow-unwrap one common nesting level used by relays (data/fields/form). */
function unwrap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  for (const key of ["data", "fields", "form", "payload"]) {
    const inner = obj[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      // Merge inner over the top level so both sets of keys are considered.
      return { ...obj, ...(inner as Record<string, unknown>) };
    }
  }
  return obj;
}

function urlencodedToObject(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(text);
  for (const [k, v] of params.entries()) if (!(k in out)) out[k] = v;
  return out;
}

/**
 * Parse a raw body string by content-type. Used by the public webhook (via
 * parseInboundBody) and the auth test console (raw-body mode) so both behave
 * identically. Defaults to trying JSON, then urlencoded.
 */
export function parseBodyString(text: string, contentType = ""): Record<string, unknown> {
  if (!text.trim()) return {};
  const ct = contentType.toLowerCase();
  if (ct.includes("x-www-form-urlencoded")) return urlencodedToObject(text);
  try {
    return unwrap(JSON.parse(text));
  } catch {
    /* not JSON — fall through */
  }
  const ue = urlencodedToObject(text);
  return Object.keys(ue).length ? ue : {};
}

/** Read + parse an inbound request body (JSON / urlencoded / multipart). */
export async function parseInboundBody(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("multipart/form-data") || ct.includes("x-www-form-urlencoded")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const obj: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string" && !(k in obj)) obj[k] = v;
    return unwrap(obj);
  }
  const text = await req.text().catch(() => "");
  return parseBodyString(text, ct);
}

/**
 * Map an arbitrary inbound object onto canonical lead fields. Resolution order:
 *   1) user custom map (theirField -> canonicalField) wins,
 *   2) built-in aliases,
 *   3) name assembled from first + last name if still missing.
 * Returns a partial object; downstream zod validation enforces required fields.
 */
export function mapLeadFields(
  raw: Record<string, unknown>,
  customMap?: Record<string, string> | null,
): Partial<Record<CanonicalField, string>> {
  // Normalized lookup of the incoming data (first non-empty value per token).
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    const val = String(v).trim();
    if (!val) continue;
    const nk = normalizeKey(k);
    if (nk && !(nk in norm)) norm[nk] = val;
  }

  const result: Partial<Record<CanonicalField, string>> = {};

  // 1) Custom map (their field name -> canonical). Normalize their keys.
  if (customMap) {
    for (const [theirField, canon] of Object.entries(customMap)) {
      if (!CANONICAL_FIELDS.includes(canon as CanonicalField)) continue;
      const nk = normalizeKey(theirField);
      if (norm[nk] !== undefined && result[canon as CanonicalField] === undefined) {
        result[canon as CanonicalField] = norm[nk];
      }
    }
  }

  // 2) Built-in aliases.
  for (const canon of CANONICAL_FIELDS) {
    if (result[canon] !== undefined) continue;
    for (const alias of BUILT_IN_ALIASES[canon]) {
      if (norm[alias] !== undefined) {
        result[canon] = norm[alias];
        break;
      }
    }
  }

  // 3) Assemble name from first + last when no single name field matched.
  if (result.name === undefined) {
    const first = FIRST_NAME_KEYS.map((k) => norm[k]).find(Boolean);
    const last = LAST_NAME_KEYS.map((k) => norm[k]).find(Boolean);
    const combined = [first, last].filter(Boolean).join(" ").trim();
    if (combined) result.name = combined;
  }

  return result;
}
