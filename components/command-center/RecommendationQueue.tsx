"use client";

import { useMemo } from "react";
import { useAgentStore, selectRecommendationQueue } from "@/store/useAgentStore";
import { EmptyState } from "@/components/layout/EmptyState";
import { TIER_COLOR_CLASS, TIER_LABEL } from "@/lib/formatters";

/**
 * RecommendationQueue
 * Source: SoT v2.0 Section 11 / 12 — primary recommendation, approval
 * status, expected impact, confidence. Approve / reject / request
 * alternative.
 * Phase 4: wired to the real Recommendation Engine output.
 * Phase 6: Approve/Reject call the real Approval Engine -> execution
 * simulation -> Verification Engine pipeline in useAgentStore. A
 * resolved/partially-resolved/unresolved outcome (with next-best-action
 * text where relevant) appears on the card right after the decision.
 * Phase 8: "Try Alternative" runs a specific alternative through that
 * same pipeline in the primary's place (Architecture Section 10 lists
 * "request alternative" as a real action, not just informational text).
 * Offered whenever the primary was rejected or came back partially/
 * unresolved and the signal isn't closed yet.
 */
export function RecommendationQueue() {
  const analyses = useAgentStore((s) => s.analyses);
  const approvals = useAgentStore((s) => s.approvals);
  const verifications = useAgentStore((s) => s.verifications);
  const approveRecommendation = useAgentStore((s) => s.approveRecommendation);
  const rejectRecommendation = useAgentStore((s) => s.rejectRecommendation);
  const tryAlternative = useAgentStore((s) => s.tryAlternative);
  const queue = useMemo(() => selectRecommendationQueue(analyses), [analyses]);

  if (queue.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Recommendation Queue</h2>
        <EmptyState
          title="No recommendations pending"
          description="Every Tier 1 and Tier 2 signal will generate a recommended action here, complete with evidence, confidence, and approval status."
        />
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <h2 className="text-sm font-semibold mb-3">
        Recommendation Queue <span className="text-muted-text font-normal">({queue.length})</span>
      </h2>
      <div className="flex flex-col gap-3">
        {queue.map(({ signal, priority, recommendation }) => {
          if (!recommendation) return null;
          const approval = approvals[recommendation.id];
          const verification = verifications[recommendation.id];
          const decided = approval?.status === "approved" || approval?.status === "rejected";
          const isClosed = signal.status === "resolved" || signal.status === "archived";
          const canTryAlternative =
            !isClosed &&
            recommendation.alternatives.length > 0 &&
            (approval?.status === "rejected" ||
              (verification && verification.outcome !== "resolved"));

          return (
            <div
              key={recommendation.id}
              className="border border-white/10 rounded-md p-3 animate-fade-in-up"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-[10px] font-data uppercase tracking-wide border rounded-full px-2 py-0.5 ${TIER_COLOR_CLASS[priority.tier]}`}
                >
                  {TIER_LABEL[priority.tier]}
                </span>
                <span className="text-[10px] font-data text-muted-text uppercase">
                  Confidence {Math.round(recommendation.confidence * 100)}%
                </span>
                {recommendation.requiresApproval && (
                  <span className="text-[10px] font-data text-warning-amber uppercase">
                    Approval required
                  </span>
                )}
              </div>

              <p className="text-sm text-white/90">{recommendation.action}</p>
              <p className="text-xs text-muted-text mt-1">{recommendation.rationale}</p>
              <p className="text-xs text-build-green/80 mt-1">
                {recommendation.expectedBenefit}
              </p>

              {verification && (
                <div className="mt-2 text-xs rounded-md border border-white/10 p-2 animate-fade-in-up">
                  <span
                    className={
                      verification.outcome === "resolved"
                        ? "text-build-green"
                        : verification.outcome === "partially_resolved"
                          ? "text-warning-amber"
                          : "text-safety-red"
                    }
                  >
                    {verification.outcome === "resolved"
                      ? "Resolved"
                      : verification.outcome === "partially_resolved"
                        ? "Partially resolved"
                        : "Unresolved"}
                  </span>
                  <span className="text-muted-text"> — {verification.resultSummary}</span>
                  {verification.nextBestAction && (
                    <p className="text-muted-text mt-1">
                      Next best action: {verification.nextBestAction}
                    </p>
                  )}
                </div>
              )}
              {!verification && approval?.status === "rejected" && (
                <p className="mt-2 text-xs text-safety-red animate-fade-in-up">
                  Rejected. {recommendation.alternatives[0] ? "Try an alternative below." : ""}
                </p>
              )}

              <div className="flex items-center gap-2 mt-3">
                <button
                  disabled={decided}
                  onClick={() => approveRecommendation(recommendation.id)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                    decided
                      ? "bg-build-green/20 text-build-green/60 cursor-not-allowed"
                      : "bg-build-green/20 text-build-green hover:bg-build-green/30"
                  }`}
                >
                  Approve
                </button>
                <button
                  disabled={decided}
                  onClick={() => rejectRecommendation(recommendation.id)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                    decided
                      ? "bg-safety-red/20 text-safety-red/60 cursor-not-allowed"
                      : "bg-safety-red/20 text-safety-red hover:bg-safety-red/30"
                  }`}
                >
                  Reject
                </button>
                {!canTryAlternative && recommendation.alternatives.length > 0 && !isClosed && (
                  <span className="text-[10px] text-muted-text ml-auto">
                    {recommendation.alternatives.length} alternative(s) available
                  </span>
                )}
              </div>

              {canTryAlternative && (
                <div className="mt-2 flex flex-col gap-1.5 animate-fade-in-up">
                  {recommendation.alternatives.map((alt, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 text-xs border border-white/10 rounded-md px-2 py-1.5"
                    >
                      <span className="text-white/80 truncate">{alt.action}</span>
                      <button
                        onClick={() => tryAlternative(recommendation.id, i)}
                        className="shrink-0 text-[10px] font-medium px-2 py-1 rounded-md bg-signal-cyan/15 text-signal-cyan hover:bg-signal-cyan/25 transition-colors"
                      >
                        Try this instead
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
