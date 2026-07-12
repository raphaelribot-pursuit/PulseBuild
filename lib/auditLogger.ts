import {
  ProjectSignal,
  PriorityOutput,
  DependencyOutput,
  Recommendation,
  TimelineEvent,
} from "@/domain/types";

/**
 * Audit Logger
 * Source: Technical Architecture v1.0, Section 11 (Event Bus and Timeline
 * Logging — event type -> timeline entry table).
 *
 * Pure function. Takes already-computed signal analyses and turns them
 * into the permanent timeline record. Does not decide anything — it only
 * narrates what the engines already decided, per the "audit trail" rule
 * shared by all three governing documents.
 */

export interface SignalAnalysisForAudit {
  signal: ProjectSignal;
  priority: PriorityOutput;
  dependencies: DependencyOutput;
  recommendation: Recommendation | null;
}

let idCounter = 0;
function nextEventId(signalId: string, suffix: string): string {
  idCounter += 1;
  return `evt_${signalId}_${suffix}_${idCounter}`;
}

export function buildTimelineFromAnalyses(
  analyses: SignalAnalysisForAudit[],
  projectId: string
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Sort by signal creation time so the timeline reads chronologically.
  const sorted = [...analyses].sort(
    (a, b) =>
      new Date(a.signal.createdAt).getTime() -
      new Date(b.signal.createdAt).getTime()
  );

  for (const { signal, priority, dependencies, recommendation } of sorted) {
    events.push({
      id: nextEventId(signal.id, "detected"),
      projectId,
      type: "signal.detected",
      timestamp: signal.createdAt,
      title: `Signal detected: ${signal.type.replace(/_/g, " ")}`,
      description: `Source: ${signal.source}. Related task: ${
        signal.relatedTaskId ?? "none"
      }.`,
      relatedSignalId: signal.id,
      evidenceIds: [],
    });

    events.push({
      id: nextEventId(signal.id, "prioritized"),
      projectId,
      type: "signal.prioritized",
      timestamp: signal.updatedAt,
      title: `Priority calculated: ${priority.tier}`,
      description: priority.explanation,
      relatedSignalId: signal.id,
      severity: priority.tier,
      evidenceIds: [],
    });

    if (dependencies.affectedTaskIds.length > 1) {
      events.push({
        id: nextEventId(signal.id, "dependency"),
        projectId,
        type: "dependency.resolved",
        timestamp: signal.updatedAt,
        title: "Dependencies identified",
        description: `${dependencies.affectedTaskIds.length - 1} downstream task(s) affected. Cascade depth ${
          dependencies.cascadeDepth
        }.${dependencies.criticalPathImpact ? " Critical path impacted." : ""}`,
        relatedSignalId: signal.id,
        severity: priority.tier,
        evidenceIds: [],
      });
    }

    if (recommendation) {
      events.push({
        id: nextEventId(signal.id, "recommendation"),
        projectId,
        type: "recommendation.created",
        timestamp: signal.updatedAt,
        title: "Recommendation ready",
        description: recommendation.action,
        relatedSignalId: signal.id,
        relatedRecommendationId: recommendation.id,
        severity: priority.tier,
        evidenceIds: [],
      });

      if (recommendation.requiresApproval) {
        events.push({
          id: nextEventId(signal.id, "approval"),
          projectId,
          type: "approval.required",
          timestamp: signal.updatedAt,
          title: "Approval needed",
          description: recommendation.approvalReason ?? "This action requires human approval.",
          relatedSignalId: signal.id,
          relatedRecommendationId: recommendation.id,
          severity: priority.tier,
          evidenceIds: [],
        });
      }
    }

    if (signal.status === "resolved") {
      events.push({
        id: nextEventId(signal.id, "verified"),
        projectId,
        type: "verification.completed",
        timestamp: signal.updatedAt,
        title: "Resolved",
        description: `${signal.type.replace(/_/g, " ")} verified as resolved.`,
        relatedSignalId: signal.id,
        severity: priority.tier,
        evidenceIds: [],
      });
    }
  }

  return events;
}
