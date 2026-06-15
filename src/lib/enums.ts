// Enum-like value sets. SQLite stores these as plain strings, so the source of
// truth for allowed values and type-safety lives here (not in the Prisma
// schema). Keep these in sync with the comments in prisma/schema.prisma.

export const LEAD_STATUS = [
  "NEW",
  "VALIDATING",
  "ROUTING",
  "IN_PROGRESS",
  "CONNECTED",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
  "NO_AGENT_AVAILABLE",
] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const AGENT_STATUS = ["AVAILABLE", "BUSY", "OFFLINE"] as const;
export type AgentStatus = (typeof AGENT_STATUS)[number];

export const CALL_ATTEMPT_STATE = [
  "PENDING",
  "AGENT_RINGING",
  "AGENT_CONNECTED",
  "LEAD_RINGING",
  "BRIDGED",
  "COMPLETED",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
  "AGENT_NO_ANSWER",
  "CANCELLED",
] as const;
export type CallAttemptState = (typeof CALL_ATTEMPT_STATE)[number];

export const CALL_OUTCOME = ["CONNECTED", "NO_ANSWER", "BUSY", "FAILED"] as const;
export type CallOutcome = (typeof CALL_OUTCOME)[number];

export const ROUTING_STRATEGY = ["ROUND_ROBIN", "PRIORITY", "SKILL_BASED"] as const;
export type RoutingStrategy = (typeof ROUTING_STRATEGY)[number];

export const ACTIVITY_TYPE = [
  "LEAD_RECEIVED",
  "LEAD_VALIDATED",
  "ROUTING_STARTED",
  "AGENT_SELECTED",
  "CALL_PLACED",
  "STATE_CHANGED",
  "CALL_COMPLETED",
  "ROUTING_FAILED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPE)[number];

// States considered "in-flight" for active-call queries and metrics.
export const ACTIVE_CALL_STATES: CallAttemptState[] = [
  "PENDING",
  "AGENT_RINGING",
  "AGENT_CONNECTED",
  "LEAD_RINGING",
  "BRIDGED",
];
