import { z } from "zod";

// Phone validation: accept common formats, normalize to E.164-ish.
// We are deliberately lenient (SMB forms are messy) but require enough digits.
const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone number is too short")
  .max(20, "Phone number is too long")
  .refine((v) => /^\+?[0-9().\-\s]+$/.test(v), "Phone number contains invalid characters")
  .refine((v) => v.replace(/\D/g, "").length >= 7, "Phone number needs at least 7 digits");

/** Normalize a messy phone string into a compact +digits form. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return "+" + digits;
  // Assume US-style 10-digit numbers get a +1 prefix; otherwise just prefix +.
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits;
}

// Inbound webhook payload from the customer-facing form.
export const leadIntakeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: phoneSchema,
  email: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
  source: z.string().trim().min(1).max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type LeadIntake = z.infer<typeof leadIntakeSchema>;

// Agent CRUD
export const agentCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  skills: z.string().trim().max(300).default(""),
  status: z.enum(["AVAILABLE", "BUSY", "OFFLINE"]).default("AVAILABLE"),
  active: z.coerce.boolean().default(true),
});

export const agentUpdateSchema = agentCreateSchema.partial();

// Lead source CRUD
export const sourceCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-_]+$/, "Use lowercase letters, numbers, dashes"),
  label: z.string().trim().min(1).max(120),
  enabled: z.coerce.boolean().default(true),
  routingStrategy: z.enum(["ROUND_ROBIN", "PRIORITY", "SKILL_BASED"]).default("ROUND_ROBIN"),
  requiredSkill: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
  priority: z.coerce.number().int().min(0).max(100).default(0),
});

export const sourceUpdateSchema = sourceCreateSchema.partial();

// Routing rule CRUD
export const ruleCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.coerce.boolean().default(true),
  order: z.coerce.number().int().min(0).default(0),
  sourceName: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
  strategy: z.enum(["ROUND_ROBIN", "PRIORITY", "SKILL_BASED"]).default("ROUND_ROBIN"),
  requiredSkill: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
  maxAttempts: z.coerce.number().int().min(1).max(10).default(3),
});

export const ruleUpdateSchema = ruleCreateSchema.partial();

// Business hours (one row per day)
export const businessHoursDaySchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  openMinute: z.coerce.number().int().min(0).max(1440),
  closeMinute: z.coerce.number().int().min(0).max(1440),
  enabled: z.coerce.boolean(),
  timezone: z.string().trim().min(1).max(60).default("UTC"),
});

export const businessHoursUpdateSchema = z.object({
  days: z.array(businessHoursDaySchema).max(7),
});
