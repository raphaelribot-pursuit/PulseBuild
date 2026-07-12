import {
  DriftState,
  EngineResult,
  EvidenceItem,
} from "@/domain/types";
import { SignalEvaluation } from "@/engines/healthEngine";
import {
  DRIFT_TIER1_ACTIVE_WEIGHT,
  DRIFT_TIER2_ACTIVE_WEIGHT,
  DRIFT_PER_AFFECTED_TASK_WEIGHT,
  DRIFT_PER_IDLE_CREW_WEIGHT,
  DRIFT_PER_UNRESOLVED_ACTION_WEIGHT,
  driftLabel,
} from "@/domain/rules/scoringWeights";

/**
 * Drift Engine
 * Source: SoT v2.0 Section 10 — "Tier 1 active x25 + Tier 2 active x15 +
 * affected tasks x5 + idle crew risks x10 + unresolved actions x8."
 *
 * Pure function. Reuses the same SignalEvaluation shape as the Health
 * Engine (see healthEngine.ts) so both engines can be run over the same
 * evaluation set in one pass by the orchestrator (Phase 4+).
 */

const TERMINAL_STATUSES = new Set(["resolved", "archived"]);

export interface DriftEngineInput {
  evaluations: SignalEvaluation[];
  updatedAt: string;
}

export function runDriftEngine(
  input: DriftEngineInput
): EngineResult<DriftState> {
  const { evaluations, updatedAt } = input;
  const warnings: string[] = [];
  const evidence: EvidenceItem[] = [];
  const causes: string[] = [];

  let score = 0;

  for (const evalItem of evaluations) {
    const { signal, priority, dependencies, hasUnresolvedRecommendation } = evalItem;
    const isActive = !TERMINAL_STATUSES.has(signal.status);
    if (!isActive) continue;

    let contribution = 0;

    if (priority.tier === "Tier1") {
      contribution += DRIFT_TIER1_ACTIVE_WEIGHT;
    } else if (priority.tier === "Tier2") {
      contribution += DRIFT_TIER2_ACTIVE_WEIGHT;
    }

    const taskContribution =
      dependencies.affectedTaskIds.length * DRIFT_PER_AFFECTED_TASK_WEIGHT;
    contribution += taskContribution;

    const idleCrewContribution =
      dependencies.affectedCrewIds.length * DRIFT_PER_IDLE_CREW_WEIGHT;
    contribution += idleCrewContribution;

    if (hasUnresolvedRecommendation) {
      contribution += DRIFT_PER_UNRESOLVED_ACTION_WEIGHT;
    }

    if (contribution > 0) {
      score += contribution;
      causes.push(
        `${signal.type} on ${signal.relatedTaskId ?? "unspecified task"} (+${contribution})`
      );
      evidence.push({
        label: `${signal.type} (${priority.tier})`,
        detail: `+${contribution} drift (tier ${
          priority.tier === "Tier1"
            ? DRIFT_TIER1_ACTIVE_WEIGHT
            : priority.tier === "Tier2"
            ? DRIFT_TIER2_ACTIVE_WEIGHT
            : 0
        }, tasks ${taskContribution}, idle crews ${idleCrewContribution}${
          hasUnresolvedRecommendation ? `, unresolved action ${DRIFT_PER_UNRESOLVED_ACTION_WEIGHT}` : ""
        })`,
        sourceEntityId: signal.id,
      });
    }
  }

  const label = driftLabel(score);

  return {
    ok: true,
    data: {
      score: Math.round(score),
      label,
      causes,
      updatedAt,
    },
    warnings,
    confidence: 0.85,
    evidence,
  };
}
