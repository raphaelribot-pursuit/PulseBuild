import { PriorityTier } from "@/domain/types";

/**
 * Health & Drift Scoring Weights
 * Source: PulseBuild Source of Truth v2.0, Section 10 (Dependency, Drift,
 * and Health Scoring — "MVP formulas should be deterministic and simple
 * enough to explain in the UI").
 *
 * These constants are shared by healthEngine.ts, driftEngine.ts, and
 * predictionEngine.ts (which uses them to preview a signal's marginal
 * impact before it's added to the active signal set).
 */

export const HEALTH_START = 100;

export const HEALTH_TIER_PENALTY: Record<PriorityTier, number> = {
  Tier1: 20,
  Tier2: 10,
  Tier3: 5,
  Tier4: 0,
};

export const HEALTH_PER_AFFECTED_TASK_PENALTY = 2;
export const HEALTH_UNRESOLVED_RECOMMENDATION_PENALTY = 5;
export const HEALTH_VERIFIED_RECOVERY_BONUS_MAX = 5;

export const DRIFT_TIER1_ACTIVE_WEIGHT = 25;
export const DRIFT_TIER2_ACTIVE_WEIGHT = 15;
export const DRIFT_PER_AFFECTED_TASK_WEIGHT = 5;
export const DRIFT_PER_IDLE_CREW_WEIGHT = 10;
export const DRIFT_PER_UNRESOLVED_ACTION_WEIGHT = 8;

/**
 * Drift score labels and thresholds.
 * NOTE: the source documents specify the drift formula but not the label
 * thresholds. These cutoffs are an MVP assumption, chosen so a single
 * active Tier 1 signal (25) reads as "Warning" and two or more read as
 * "High Drift" or worse. Revisit with Product Owner once real demo data
 * shows what "feels right" on screen.
 */
export function driftLabel(
  score: number
): "Normal" | "Warning" | "High Drift" | "Critical Drift" {
  if (score <= 15) return "Normal";
  if (score <= 40) return "Warning";
  if (score <= 75) return "High Drift";
  return "Critical Drift";
}
