import {
  SignalAnalysis,
} from "@/agent/agentOrchestrator";
import {
  AgentExplanation,
  ApprovalResult,
  VerificationResult,
  HealthState,
  DriftState,
} from "@/domain/types";
import { TIER_LABEL, formatSignalType } from "@/lib/formatters";

/**
 * Agent Explanation Builder
 * Source: Technical Architecture v1.0, Section 14 ("Chat response
 * builder — buildAgentResponse(decision): Situation / Priority /
 * Evidence / Impact / Recommendation / Approval / Verification") and
 * Section 8 ("LLM boundary — the LLM can turn AgentDecision into clear
 * language... it cannot independently change priority, create
 * recommendation IDs, close signals, approve actions, or rewrite project
 * state").
 *
 * This is the deterministic half of the chat layer. It turns a
 * SignalAnalysis (+ current approval/verification, if any) into a
 * structured AgentExplanation using only fields that already exist on
 * the engine outputs — no invented text. The LLM route
 * (app/api/chat/route.ts) sends this structured object to Claude as
 * grounding context and asks it to phrase a natural-language answer
 * *from these fields only* — it is explicitly told not to introduce
 * facts beyond what's here. If the API key isn't configured, the chat
 * panel falls back to rendering this object directly as plain text, so
 * the app is never fully non-functional without a key.
 */

export function buildAgentResponse(
  analysis: SignalAnalysis,
  approval?: ApprovalResult,
  verification?: VerificationResult
): AgentExplanation {
  const { signal, priority, dependencies, recommendation } = analysis;

  const situation = `${formatSignalType(signal.type)}${
    signal.relatedTaskId ? ` affecting ${signal.relatedTaskId.replace(/_/g, " ")}` : ""
  }.`;

  const priorityText = `${TIER_LABEL[priority.tier]} — ${priority.explanation}`;

  const evidence = [
    `Confidence ${Math.round(priority.attentionScore)}/100 attention score.`,
    ...(dependencies.affectedTaskIds.length > 0
      ? [`${dependencies.affectedTaskIds.length} downstream task(s) affected.`]
      : []),
    ...(dependencies.criticalPathImpact ? ["Impacts the critical path."] : []),
  ];

  const impact = dependencies.criticalPathImpact
    ? `This is on the critical path — delay here pushes the whole schedule back. ${dependencies.affectedTaskIds.length} task(s) are downstream of it.`
    : `${dependencies.affectedTaskIds.length} downstream task(s) are affected; not on the critical path.`;

  const recommendationText = recommendation
    ? recommendation.action
    : "No recommendation — this signal is monitored, not acted on, at its current tier.";

  const approvalText = !recommendation
    ? "Not applicable."
    : approval
      ? approval.status === "approved"
        ? `Approved${approval.decidedBy ? ` by ${approval.decidedBy}` : ""}.`
        : approval.status === "rejected"
          ? `Rejected${approval.decidedBy ? ` by ${approval.decidedBy}` : ""}.`
          : approval.status === "blocked_safety"
            ? "Blocked pending human safety review."
            : "Awaiting approval."
      : recommendation.requiresApproval
        ? `Requires approval — ${recommendation.approvalReason ?? "high-impact action."}`
        : "No approval required — autonomous action.";

  const verificationText = verification
    ? `${
        verification.outcome === "resolved"
          ? "Resolved"
          : verification.outcome === "partially_resolved"
            ? "Partially resolved"
            : "Unresolved"
      } — ${verification.resultSummary}${
        verification.nextBestAction ? ` Next: ${verification.nextBestAction}` : ""
      }`
    : recommendation
      ? recommendation.verificationPlan.expectedSignal
      : "Not applicable.";

  return {
    situation,
    priority: priorityText,
    evidence,
    impact,
    recommendation: recommendationText,
    confidence: recommendation
      ? `${Math.round(recommendation.confidence * 100)}%`
      : `${Math.round(priority.attentionScore)}%`,
    approval: approvalText,
    verification: verificationText,
  };
}

/** Renders an AgentExplanation as plain text — used both as the LLM's
 * grounding context and as the no-API-key fallback shown directly in the
 * chat panel. */
export function explanationToText(explanation: AgentExplanation): string {
  return [
    `Situation: ${explanation.situation}`,
    `Priority: ${explanation.priority}`,
    `Evidence: ${explanation.evidence.join(" ")}`,
    `Impact: ${explanation.impact}`,
    `Recommendation: ${explanation.recommendation}`,
    `Confidence: ${explanation.confidence}`,
    `Approval: ${explanation.approval}`,
    `Verification: ${explanation.verification}`,
  ].join("\n");
}

export function buildNoBlockerSummary(health: HealthState, drift: DriftState): string {
  return `No active blockers right now. Health is ${health.overall}/100, drift is "${drift.label}" (${drift.score}). Everything currently in the system is resolved, archived, or monitoring-only.`;
}
