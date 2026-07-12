import {
  ActionCategory,
  Recommendation,
  VerificationResult,
  VerificationOutcome,
  EngineResult,
} from "@/domain/types";
import { ExecutionEffect } from "@/lib/executionSimulation";

/**
 * Verification Engine
 * Source: Technical Architecture v1.0, Section 7 ("Verification Engine —
 * Check whether action improved condition — Input: Action + updated state
 * — Output: Resolved/partial/unresolved") and Section 13 (workflow
 * diagram: resolved -> close signal + improve health/drift; partially
 * resolved -> keep open + next action; unresolved -> escalate + recommend
 * alternative).
 *
 * Classification rule, built on the ExecutionEffect that already came
 * back from `runExecutionSimulation` against real crew/equipment/
 * inspection state (Phase 6 design decision: verification is rule-based
 * off actual entity availability, not a scripted per-signal outcome
 * field):
 *  - Categories that fix the actual root cause when feasible
 *    (inspection_reschedule, equipment_reassignment, safety_review,
 *    notification_only) -> `resolved` if feasible, `unresolved` if not
 *    (no backup equipment / no way to satisfy it right now).
 *  - Categories that only mitigate a side effect without touching the
 *    root cause (crew_reassignment, task_resequence — the crew is no
 *    longer idle, but the material delay / weather / behind-schedule
 *    condition that caused the signal is untouched) -> always
 *    `partially_resolved`, since they help but don't close the loop.
 *  - permit_change is never within this system's control -> always
 *    `unresolved` with a notification-based next step.
 *
 * This keeps health/drift as the *effect* of verification (a resolved
 * signal stops being "active" for the Health Engine, removing its tier
 * and unresolved-recommendation penalties — see healthEngine.ts) rather
 * than verification reading health/drift as its *input*, which would be
 * circular.
 */

const ROOT_CAUSE_FIXING = new Set<ActionCategory>([
  "inspection_reschedule",
  "equipment_reassignment",
  "safety_review",
  "notification_only",
]);

const MITIGATES_ONLY = new Set<ActionCategory>(["crew_reassignment", "task_resequence"]);

export interface VerificationEngineInput {
  recommendation: Recommendation;
  effect: ExecutionEffect;
  checkedAt: string;
}

export function runVerificationEngine(
  input: VerificationEngineInput
): EngineResult<VerificationResult> {
  const { recommendation, effect, checkedAt } = input;
  const { actionCategory } = recommendation;

  let outcome: VerificationOutcome;
  let resultSummary: string;
  let nextBestAction: string | undefined;

  if (actionCategory === "permit_change") {
    outcome = "unresolved";
    resultSummary = effect.note;
    nextBestAction =
      recommendation.alternatives[0]?.action ??
      "Continue monitoring permit status; no in-system action can accelerate it further.";
  } else if (MITIGATES_ONLY.has(actionCategory)) {
    outcome = "partially_resolved";
    resultSummary = `${effect.note} The underlying condition this signal reports is unaffected and will clear independently.`;
    nextBestAction =
      "Keep monitoring — this signal will resolve on its own once the underlying condition clears.";
  } else if (ROOT_CAUSE_FIXING.has(actionCategory)) {
    if (effect.feasible) {
      outcome = "resolved";
      resultSummary = effect.note;
    } else {
      outcome = "unresolved";
      resultSummary = effect.note;
      nextBestAction =
        recommendation.alternatives[0]?.action ??
        "Escalate to project manager for manual resolution.";
    }
  } else {
    outcome = "unresolved";
    resultSummary = effect.note;
  }

  return {
    ok: true,
    data: {
      outcome,
      checkedAt,
      resultSummary,
      nextBestAction,
    },
    warnings: [],
    confidence: 0.9,
    evidence: [
      {
        label: "Verification basis",
        detail: resultSummary,
        sourceEntityId: recommendation.id,
      },
    ],
  };
}
