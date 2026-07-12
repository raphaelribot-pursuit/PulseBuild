import {
  ProjectSignal,
  DependencyOutput,
  PriorityOutput,
  PredictionOutput,
  EngineResult,
  EvidenceItem,
  SignalType,
} from "@/domain/types";
import {
  HEALTH_TIER_PENALTY,
  HEALTH_PER_AFFECTED_TASK_PENALTY,
  DRIFT_TIER1_ACTIVE_WEIGHT,
  DRIFT_TIER2_ACTIVE_WEIGHT,
  DRIFT_PER_AFFECTED_TASK_WEIGHT,
  DRIFT_PER_IDLE_CREW_WEIGHT,
} from "@/domain/rules/scoringWeights";

/**
 * Prediction Engine
 * Source: Cognitive & Reasoning Spec, Section 10 (Prediction Engine —
 * "Predictions never overwrite reality. Predictions are simulations.").
 *
 * Pure function. Estimates what happens if this signal is ignored:
 * delay, idle labor risk, and the marginal health/drift impact it would
 * contribute if left unresolved. Uses the same weight tables as the
 * Health and Drift Engines so a prediction and the eventual real score
 * change are consistent with each other.
 */

export interface PredictionEngineInput {
  signal: ProjectSignal;
  priority: PriorityOutput;
  dependencies: DependencyOutput;
}

/** Baseline delay estimate by signal type, in hours. MVP assumption where
 * the source docs don't specify exact figures — deterministic and
 * explainable, not a claim of real-world accuracy. */
const BASE_DELAY_HOURS: Record<SignalType, number> = {
  safety_incident: 24,
  inspection_failed: 24,
  inspection_missing: 24,
  critical_equipment_failure: 16,
  material_delivery_delayed: 8,
  crew_shortage: 4,
  weather_alert: 6,
  permit_pending: 48,
  task_behind_schedule: 8,
  minor_delay: 2,
  task_complete: 0,
  delivery_received: 0,
};

export function runPredictionEngine(
  input: PredictionEngineInput
): EngineResult<PredictionOutput> {
  const { signal, priority, dependencies } = input;
  const warnings: string[] = [];
  const evidence: EvidenceItem[] = [];

  const baseDelay = BASE_DELAY_HOURS[signal.type] ?? 4;
  // Cascade depth extends the effective delay: each downstream hop adds
  // recovery friction beyond the immediate blocker.
  const estimatedDelayHours = baseDelay + dependencies.cascadeDepth * 2;

  evidence.push({
    label: "Base delay estimate",
    detail: `${signal.type} carries a baseline estimate of ${baseDelay}h, extended by cascade depth (${dependencies.cascadeDepth}).`,
  });

  const idleLaborRisk =
    dependencies.affectedCrewIds.length > 0 &&
    (priority.tier === "Tier1" || priority.tier === "Tier2");

  if (idleLaborRisk) {
    evidence.push({
      label: "Idle labor risk",
      detail: `${dependencies.affectedCrewIds.length} crew(s) are assigned to affected tasks with no confirmed alternate work.`,
    });
  }

  // Marginal health impact this signal alone would contribute if it
  // remains unresolved (mirrors Health Engine formula, SoT Section 10).
  const healthImpact =
    HEALTH_TIER_PENALTY[priority.tier] +
    dependencies.affectedTaskIds.length * HEALTH_PER_AFFECTED_TASK_PENALTY;

  // Marginal drift impact this signal alone would contribute (mirrors
  // Drift Engine formula, SoT Section 10).
  let driftImpact =
    dependencies.affectedTaskIds.length * DRIFT_PER_AFFECTED_TASK_WEIGHT;
  if (priority.tier === "Tier1") driftImpact += DRIFT_TIER1_ACTIVE_WEIGHT;
  if (priority.tier === "Tier2") driftImpact += DRIFT_TIER2_ACTIVE_WEIGHT;
  if (idleLaborRisk) driftImpact += DRIFT_PER_IDLE_CREW_WEIGHT;

  // Simplified recovery duration estimate: MVP assumption, roughly half
  // the projected delay, floored at 1 hour so it's never reported as
  // instantaneous.
  const recoveryDurationHours = Math.max(1, Math.ceil(estimatedDelayHours / 2));

  return {
    ok: true,
    data: {
      estimatedDelayHours,
      idleLaborRisk,
      cascadeDepth: dependencies.cascadeDepth,
      healthImpact,
      driftImpact,
      recoveryDurationHours,
    },
    warnings,
    confidence: 0.75,
    evidence,
  };
}
