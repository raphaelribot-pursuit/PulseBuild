import { SignalAnalysis } from "@/agent/agentOrchestrator";
import { HealthState, DriftState, ApprovalResult, VerificationResult } from "@/domain/types";
import { buildAgentResponse, explanationToText, buildNoBlockerSummary } from "@/lib/agentExplanationBuilder";

/**
 * Chat Context Builder
 * Source: Technical Architecture v1.0, Section 8 ("Never allow the chat
 * layer to invent project state. It can read project state and explain
 * it, but it cannot create facts without a structured user action.") and
 * Section 14 (chat response builder).
 *
 * This assembles the ONLY facts the LLM route is allowed to talk about —
 * every SignalAnalysis gets run through the deterministic
 * buildAgentResponse() explanation builder first, so the LLM never sees
 * raw internal fields it might mis-paraphrase into an invented claim,
 * only already-vetted structured sentences.
 */

export interface ChatContext {
  projectName: string;
  health: number;
  drift: string;
  topBlocker: string | null;
  activeSignals: string[];
}

export function buildChatContext(
  projectName: string,
  health: HealthState,
  drift: DriftState,
  analyses: SignalAnalysis[],
  approvals: Record<string, ApprovalResult>,
  verifications: Record<string, VerificationResult>
): ChatContext {
  const active = analyses.filter(
    (a) => a.signal.status !== "resolved" && a.signal.status !== "archived"
  );

  const topBlocker = active.sort(
    (a, b) => b.priority.attentionScore - a.priority.attentionScore
  )[0];

  const activeSignals = active.map((a) => {
    const approval = a.recommendation ? approvals[a.recommendation.id] : undefined;
    const verification = a.recommendation ? verifications[a.recommendation.id] : undefined;
    return explanationToText(buildAgentResponse(a, approval, verification));
  });

  return {
    projectName,
    health: health.overall,
    drift: `${drift.label} (${drift.score})`,
    topBlocker: topBlocker
      ? explanationToText(
          buildAgentResponse(
            topBlocker,
            topBlocker.recommendation ? approvals[topBlocker.recommendation.id] : undefined,
            topBlocker.recommendation ? verifications[topBlocker.recommendation.id] : undefined
          )
        )
      : buildNoBlockerSummary(health, drift),
    activeSignals,
  };
}
