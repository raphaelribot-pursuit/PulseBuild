import {
  Recommendation,
  ApprovalResult,
  ApprovalStatus,
  EngineResult,
} from "@/domain/types";
import { APPROVAL_RULES } from "@/domain/rules/approvalRules";

/**
 * Approval Engine
 * Source: Technical Architecture v1.0, Section 7 ("Approval Engine —
 * Determine human approval requirement — Input: Recommendation + safety
 * rules — Output: Approval status") and Section 13 (Approval and
 * Verification Workflow diagram + approval rules).
 *
 * Pure function, two responsibilities split cleanly:
 *  - `runApprovalEngine` classifies a fresh recommendation into its
 *    starting ApprovalStatus (autonomous / approval_required /
 *    blocked_safety) before any human has acted.
 *  - `decideApproval` applies a human's approve/reject decision on top of
 *    that starting classification and stamps who/when.
 *
 * "Never skip approval for high-impact actions" (Architecture Section 8):
 * `neverAutonomous` categories always classify as blocked_safety
 * regardless of the plain `requiresApproval` flag, and blocked_safety can
 * still be approved by a human (safety actions require human review, they
 * are not permanently frozen) — but never auto-transition to autonomous.
 */

export interface ApprovalEngineInput {
  recommendation: Recommendation;
}

export function runApprovalEngine(
  input: ApprovalEngineInput
): EngineResult<ApprovalResult> {
  const { recommendation } = input;
  const rule = APPROVAL_RULES[recommendation.actionCategory];

  let status: ApprovalStatus;
  if (rule.neverAutonomous) {
    status = "blocked_safety";
  } else if (rule.requiresApproval) {
    status = "approval_required";
  } else {
    status = "autonomous";
  }

  return {
    ok: true,
    data: {
      status,
      reason: rule.reason,
    },
    warnings: [],
    confidence: 1,
    evidence: [
      {
        label: "Approval basis",
        detail: rule.reason,
        sourceEntityId: recommendation.id,
      },
    ],
  };
}

export interface DecideApprovalInput {
  current: ApprovalResult;
  decision: "approve" | "reject";
  decidedBy: string;
  decidedAt: string;
}

/** Applies a human decision on top of an existing ApprovalResult. Refuses
 * to move a decision forward from a terminal state (approved/rejected) —
 * decisions are final in this MVP; re-running the recommendation would
 * need a fresh Recommendation id, not a re-decision on this one. */
export function decideApproval(
  input: DecideApprovalInput
): EngineResult<ApprovalResult> {
  const { current, decision, decidedBy, decidedAt } = input;

  if (current.status === "approved" || current.status === "rejected") {
    return {
      ok: false,
      data: current,
      warnings: [
        `Approval already finalized as "${current.status}"; ignoring new "${decision}" decision.`,
      ],
      confidence: 1,
      evidence: [],
    };
  }

  const nextStatus: ApprovalStatus =
    decision === "approve" ? "approved" : "rejected";

  return {
    ok: true,
    data: {
      status: nextStatus,
      reason:
        decision === "approve"
          ? `Approved by ${decidedBy}.`
          : `Rejected by ${decidedBy}.`,
      decidedAt,
      decidedBy,
    },
    warnings: [],
    confidence: 1,
    evidence: [],
  };
}
