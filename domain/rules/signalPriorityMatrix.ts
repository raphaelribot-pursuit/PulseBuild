import { SignalType, PriorityTier } from "@/domain/types";

/**
 * Signal Taxonomy and Priority Matrix
 * Source: PulseBuild Source of Truth v2.0, Section 9.
 *
 * This is the ground truth default tier per signal type before any
 * escalation logic runs. The Priority Engine consults this table first,
 * then applies escalation rules (see priorityEngine.ts).
 */
export interface PriorityMatrixEntry {
  defaultTier: PriorityTier;
  primaryReaction: string;
  verificationCheck: string;
}

export const SIGNAL_PRIORITY_MATRIX: Record<SignalType, PriorityMatrixEntry> = {
  safety_incident: {
    defaultTier: "Tier1",
    primaryReaction: "Stop automation, alert human, require safety review",
    verificationCheck: "Human acknowledgement logged",
  },
  inspection_failed: {
    defaultTier: "Tier1",
    primaryReaction: "Block dependent work, recommend recovery plan",
    verificationCheck: "Inspection rescheduled or passed",
  },
  inspection_missing: {
    defaultTier: "Tier1",
    primaryReaction: "Prevent task start, notify superintendent",
    verificationCheck: "Inspection scheduled or completed",
  },
  critical_equipment_failure: {
    defaultTier: "Tier1",
    primaryReaction: "Recommend backup equipment or resequence work",
    verificationCheck: "Equipment assigned or task moved",
  },
  material_delivery_delayed: {
    defaultTier: "Tier2",
    primaryReaction: "Predict idle crew, recommend alternate task",
    verificationCheck: "New ETA or crew reassigned",
  },
  crew_shortage: {
    defaultTier: "Tier2",
    primaryReaction: "Recommend backup crew or reduced scope",
    verificationCheck: "Crew count restored or plan adjusted",
  },
  weather_alert: {
    defaultTier: "Tier2",
    primaryReaction: "Move indoor work forward or reschedule outdoor work",
    verificationCheck: "Weather-compatible task active",
  },
  permit_pending: {
    defaultTier: "Tier2",
    primaryReaction: "Block dependent task and notify coordinator",
    verificationCheck: "Permit approved or task resequenced",
  },
  task_behind_schedule: {
    defaultTier: "Tier2",
    primaryReaction: "Assess downstream impact and recommend recovery",
    verificationCheck: "Progress updated or recovery action approved",
  },
  minor_delay: {
    defaultTier: "Tier3",
    primaryReaction: "Monitor and show warning",
    verificationCheck: "No escalation needed",
  },
  task_complete: {
    defaultTier: "Tier4",
    primaryReaction: "Update dependencies and health",
    verificationCheck: "Downstream tasks unlocked",
  },
  delivery_received: {
    defaultTier: "Tier4",
    primaryReaction: "Update material status and active tasks",
    verificationCheck: "Material availability confirmed",
  },
};

export const TIER_RANK: Record<PriorityTier, number> = {
  Tier1: 1,
  Tier2: 2,
  Tier3: 3,
  Tier4: 4,
};

/** Returns true if `a` is a higher (more urgent) priority than `b`. */
export function isHigherPriority(a: PriorityTier, b: PriorityTier): boolean {
  return TIER_RANK[a] < TIER_RANK[b];
}

/** One tier more urgent than the given tier, floored at Tier1. */
export function escalate(tier: PriorityTier): PriorityTier {
  switch (tier) {
    case "Tier4":
      return "Tier3";
    case "Tier3":
      return "Tier2";
    case "Tier2":
    case "Tier1":
    default:
      return "Tier1";
  }
}
