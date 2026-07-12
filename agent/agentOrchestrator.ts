import {
  ProjectSignal,
  Task,
  Crew,
  Material,
  Equipment,
  PriorityOutput,
  DependencyOutput,
  PredictionOutput,
  Recommendation,
  HealthState,
  DriftState,
  TimelineEvent,
} from "@/domain/types";
import { runDependencyEngine } from "@/engines/dependencyEngine";
import { runPriorityEngine } from "@/engines/priorityEngine";
import { runPredictionEngine } from "@/engines/predictionEngine";
import { runRecommendationEngine } from "@/engines/recommendationEngine";
import { runHealthEngine, SignalEvaluation } from "@/engines/healthEngine";
import { runDriftEngine } from "@/engines/driftEngine";
import { buildTimelineFromAnalyses } from "@/lib/auditLogger";

/**
 * Agent Orchestrator
 * Source: Technical Architecture v1.0, Section 8 (Agent Orchestration
 * Layer — "coordinates the deterministic engines... Never skip approval
 * for high-impact actions. Never mark a recommendation resolved without
 * verification.").
 *
 * This is the orchestrator, NOT the LLM. It runs engines in the pipeline
 * order from Architecture Section 4 and produces structured output for
 * the store/UI to consume. No language generation happens here — that's
 * the chat/explanation layer, deferred to Phase 7.
 *
 * MVP scope note: this orchestrator recomputes everything from the full
 * signal list on every call. That's intentional for Phase 4 — it keeps
 * the orchestrator a pure function with no internal state, easy to test
 * and easy to re-run once Phase 5's simulation engine starts feeding in
 * new signals over time.
 */

export interface SignalAnalysis {
  signal: ProjectSignal;
  priority: PriorityOutput;
  dependencies: DependencyOutput;
  prediction: PredictionOutput;
  recommendation: Recommendation | null;
  hasUnresolvedRecommendation: boolean;
}

export interface OrchestratorInput {
  projectId: string;
  signals: ProjectSignal[];
  tasks: Task[];
  crews: Crew[];
  materials: Material[];
  equipment: Equipment[];
  /** ISO timestamp treated as "now" for relative-time display and for the
   * health/drift snapshot's updatedAt field. */
  asOf: string;
}

export interface OrchestratorOutput {
  analyses: SignalAnalysis[];
  health: HealthState;
  drift: DriftState;
  timeline: TimelineEvent[];
  /** The single highest-attention active signal, or null if nothing is
   * active. Drives the "top blocker" requirement — SoT v2.0 Section 1:
   * "Show the highest priority operational blocker within five seconds
   * of opening the app." */
  topBlocker: SignalAnalysis | null;
}

const TERMINAL_STATUSES = new Set(["resolved", "archived"]);

function isActive(signal: ProjectSignal): boolean {
  return !TERMINAL_STATUSES.has(signal.status);
}

export function runAgentOrchestrator(
  input: OrchestratorInput
): OrchestratorOutput {
  const { projectId, signals, tasks, crews, materials, equipment, asOf } = input;

  const analyses: SignalAnalysis[] = signals.map((signal) => {
    const depResult = runDependencyEngine({ signal, tasks, crews });
    const priorityResult = runPriorityEngine({
      signal,
      dependencies: depResult.data,
      activeSignals: signals,
    });
    const predictionResult = runPredictionEngine({
      signal,
      priority: priorityResult.data,
      dependencies: depResult.data,
    });
    const recommendationResult = runRecommendationEngine({
      signal,
      priority: priorityResult.data,
      dependencies: depResult.data,
      prediction: predictionResult.data,
      tasks,
      crews,
      materials,
      equipment,
    });

    const requiresRecommendation =
      priorityResult.data.tier === "Tier1" || priorityResult.data.tier === "Tier2";
    const hasUnresolvedRecommendation =
      isActive(signal) && requiresRecommendation && signal.status !== "action_taken";

    return {
      signal,
      priority: priorityResult.data,
      dependencies: depResult.data,
      prediction: predictionResult.data,
      recommendation: recommendationResult.data,
      hasUnresolvedRecommendation,
    };
  });

  const evaluations: SignalEvaluation[] = analyses.map((a) => ({
    signal: a.signal,
    priority: a.priority,
    dependencies: a.dependencies,
    hasUnresolvedRecommendation: a.hasUnresolvedRecommendation,
  }));

  const health = runHealthEngine({ evaluations, updatedAt: asOf }).data;
  const drift = runDriftEngine({ evaluations, updatedAt: asOf }).data;

  const timeline = buildTimelineFromAnalyses(
    analyses.map((a) => ({
      signal: a.signal,
      priority: a.priority,
      dependencies: a.dependencies,
      recommendation: a.recommendation,
    })),
    projectId
  );

  const topBlocker = analyses
    .filter((a) => isActive(a.signal))
    .sort((a, b) => b.priority.attentionScore - a.priority.attentionScore)[0];

  return {
    analyses,
    health,
    drift,
    timeline,
    topBlocker: topBlocker ?? null,
  };
}
