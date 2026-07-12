import { create } from "zustand";
import {
  seedProject,
  seedTasks,
  seedCrews,
  seedMaterials,
  seedEquipment,
  seedSignals,
} from "@/data";
import { DEMO_CURRENT_DATE } from "@/domain/constants/demo";
import {
  runAgentOrchestrator,
  SignalAnalysis,
  OrchestratorOutput,
} from "@/agent/agentOrchestrator";
import {
  HealthState,
  DriftState,
  TimelineEvent,
  ProjectSignal,
  ApprovalResult,
  VerificationResult,
  Recommendation,
} from "@/domain/types";
import { runApprovalEngine, decideApproval } from "@/engines/approvalEngine";
import { runVerificationEngine } from "@/engines/verificationEngine";
import { runExecutionSimulation } from "@/lib/executionSimulation";
import { useProjectStore } from "@/store/useProjectStore";
import { resetSpokenSignals } from "@/lib/voiceAdapter";

/**
 * useAgentStore
 * Source: Technical Architecture v1.0, Section 9 (State Management
 * Architecture — useAgentStore holds "signals, recommendations,
 * approvals, verification records, timeline").
 *
 * Phase 4 → Phase 5 change: in Phase 4 the orchestrator ran once at
 * module load over the FULL seed signal list, since there was no
 * simulation engine yet to control pacing. Now that Phase 5's simulation
 * engine (simulation/simulationRunner.ts + store/useSimulationStore.ts)
 * decides which signals are "in the system" at any moment, this store
 * starts empty — matching the Architecture Section 10 UI rule ("empty
 * states should teach the user what will happen when the simulation
 * starts") — and grows as `ingestSignal` is called by the simulation
 * store's playback loop. `analyses` / `health` / `drift` / `timeline` /
 * `topBlocker` are recomputed by re-running the same pure, deterministic
 * orchestrator over just the revealed subset each time a signal arrives.
 * The orchestrator itself is untouched — it has no idea a simulation
 * exists, per the Architecture Section 3 rule that simulation/ must never
 * be imported by core engines/orchestration logic (the dependency only
 * ever points the other way: store -> orchestrator, simulation -> store).
 *
 * `approveRecommendation` / `rejectRecommendation` remain stubbed (log a
 * warning, no-op) — the Approval Engine is Phase 6 scope.
 */

const seedSignalsById = new Map(seedSignals.map((s) => [s.id, s]));

/** Phase 6: signals mutate as approvals/verifications happen (status
 * moves action_taken -> resolved/verification_pending). Seed data itself
 * stays immutable — overrides are layered on top per signal id, the same
 * pattern the simulation store uses for "which signals are revealed." */
function applySignalOverrides(
  revealedSignalIds: string[],
  overrides: Record<string, Partial<ProjectSignal>>
): ProjectSignal[] {
  return revealedSignalIds
    .map((id) => seedSignalsById.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({ ...s, ...overrides[s.id] }));
}

function recompute(
  revealedSignalIds: string[],
  asOf: string,
  overrides: Record<string, Partial<ProjectSignal>> = {}
): OrchestratorOutput {
  const signals = applySignalOverrides(revealedSignalIds, overrides);

  return runAgentOrchestrator({
    projectId: seedProject.id,
    signals,
    tasks: seedTasks,
    crews: seedCrews,
    materials: seedMaterials,
    equipment: seedEquipment,
    asOf,
  });
}

// Computed once at module load with an EMPTY revealed set. This is still
// fully deterministic (same result on server and client — no hydration
// mismatch risk), it just now represents "simulation not started yet"
// instead of "everything already happened."
const initialOutput = recompute([], DEMO_CURRENT_DATE);

export interface AgentStoreState {
  /** Ids of seed signals the simulation has revealed so far, in the
   * order they were ingested. */
  revealedSignalIds: string[];
  /** Phase 6: per-signal field overrides (status/updatedAt) layered onto
   * the immutable seed signal when a recommendation is approved/rejected
   * and verified. */
  signalOverrides: Record<string, Partial<ProjectSignal>>;
  /** Latest ApprovalResult per recommendation id. */
  approvals: Record<string, ApprovalResult>;
  /** Latest VerificationResult per recommendation id, once verified. */
  verifications: Record<string, VerificationResult>;
  analyses: SignalAnalysis[];
  health: HealthState;
  drift: DriftState;
  timeline: TimelineEvent[];
  topBlocker: SignalAnalysis | null;
  asOf: string;

  /** Called by useSimulationStore's playback loop each time a scripted
   * event fires. Idempotent — ingesting an already-revealed signal id is
   * a no-op rather than a duplicate. */
  ingestSignal: (signalId: string) => void;
  /** Called by useSimulationStore.resetSimulation() to return to the
   * pre-simulation empty state. */
  resetAgentState: () => void;

  approveRecommendation: (recommendationId: string) => void;
  rejectRecommendation: (recommendationId: string) => void;
  /** Phase 8: run a specific alternative through the same approval
   * pipeline as the primary action, in its place. */
  tryAlternative: (recommendationId: string, alternativeIndex: number) => void;
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  revealedSignalIds: [],
  signalOverrides: {},
  approvals: {},
  verifications: {},
  analyses: initialOutput.analyses,
  health: initialOutput.health,
  drift: initialOutput.drift,
  timeline: initialOutput.timeline,
  topBlocker: initialOutput.topBlocker,
  asOf: DEMO_CURRENT_DATE,

  ingestSignal: (signalId: string) => {
    const signal = seedSignalsById.get(signalId);
    if (!signal) {
      console.warn(`ingestSignal: unknown seed signal id "${signalId}"`);
      return;
    }

    const { revealedSignalIds, asOf, signalOverrides } = get();
    if (revealedSignalIds.includes(signalId)) return; // idempotent

    const nextIds = [...revealedSignalIds, signalId];
    // "asOf" advances to the newly ingested signal's createdAt so the
    // Command Center's relative timestamps and health/drift snapshot
    // feel live as playback progresses. Only ever moves forward — a few
    // seed signals (sig_09/10/11) are archived events with OLD historical
    // timestamps played late in the script for lifecycle-variety
    // purposes (see simulationEvents.ts), and "now" shouldn't rewind for
    // them. Still fully deterministic (driven by seed data, never
    // Date.now()).
    const nextAsOf =
      new Date(signal.createdAt).getTime() > new Date(asOf).getTime()
        ? signal.createdAt
        : asOf;

    const output = recompute(nextIds, nextAsOf, signalOverrides);
    set({
      revealedSignalIds: nextIds,
      asOf: nextAsOf,
      analyses: output.analyses,
      health: output.health,
      drift: output.drift,
      timeline: output.timeline,
      topBlocker: output.topBlocker,
    });
  },

  resetAgentState: () => {
    const output = recompute([], DEMO_CURRENT_DATE);
    resetSpokenSignals();
    set({
      revealedSignalIds: [],
      signalOverrides: {},
      approvals: {},
      verifications: {},
      asOf: DEMO_CURRENT_DATE,
      analyses: output.analyses,
      health: output.health,
      drift: output.drift,
      timeline: output.timeline,
      topBlocker: output.topBlocker,
    });
  },

  approveRecommendation: (recommendationId: string) => {
    const state = get();
    const analysis = state.analyses.find(
      (a) => a.recommendation?.id === recommendationId
    );
    const recommendation = analysis?.recommendation;
    if (!analysis || !recommendation) {
      console.warn(`approveRecommendation: no recommendation "${recommendationId}" found.`);
      return;
    }
    runApprovalPipeline(set, get, {
      analysis,
      recommendationId,
      actionToRun: recommendation,
    });
  },

  rejectRecommendation: (recommendationId: string) => {
    const state = get();
    const analysis = state.analyses.find(
      (a) => a.recommendation?.id === recommendationId
    );
    const recommendation = analysis?.recommendation;
    if (!analysis || !recommendation) {
      console.warn(`rejectRecommendation: no recommendation "${recommendationId}" found.`);
      return;
    }

    const decidedAt = state.asOf;
    const starting =
      state.approvals[recommendationId] ??
      runApprovalEngine({ recommendation }).data;
    const decided = decideApproval({
      current: starting,
      decision: "reject",
      decidedBy: "user",
      decidedAt,
    });
    if (!decided.ok) {
      console.warn(decided.warnings.join(" "));
      return;
    }

    // Rejection just logs the decision (Architecture Section 13: "log
    // rejection + alternative") — the signal stays active and the
    // recommendation (with its alternatives) remains visible so the user
    // can reconsider or try a different course of action via
    // tryAlternative.
    const event: TimelineEvent = {
      id: `evt_${analysis.signal.id}_rejected_${decidedAt}`,
      projectId: seedProject.id,
      type: "approval.rejected",
      timestamp: decidedAt,
      title: "Action rejected",
      description: `${recommendation.action} — rejected by user.${
        recommendation.alternatives[0]
          ? ` Alternative available: ${recommendation.alternatives[0].action}`
          : ""
      }`,
      relatedSignalId: analysis.signal.id,
      relatedRecommendationId: recommendation.id,
      severity: analysis.priority.tier,
      evidenceIds: [],
    };

    set({
      approvals: { ...state.approvals, [recommendationId]: decided.data },
      timeline: [...state.timeline, event],
    });
  },

  tryAlternative: (recommendationId: string, alternativeIndex: number) => {
    const state = get();
    const analysis = state.analyses.find(
      (a) => a.recommendation?.id === recommendationId
    );
    const recommendation = analysis?.recommendation;
    const alternative = recommendation?.alternatives[alternativeIndex];
    if (!analysis || !recommendation || !alternative) {
      console.warn(
        `tryAlternative: no recommendation/alternative "${recommendationId}"[${alternativeIndex}] found.`
      );
      return;
    }

    // Phase 8: run the chosen alternative through the exact same
    // Approval -> Execution Simulation -> Verification pipeline as the
    // primary action (Architecture Section 10: RecommendationQueue
    // actions are "Approve, reject, request alternative" — this makes
    // "request alternative" a real decision, not just a text display).
    // It's a synthetic Recommendation reusing the primary's identity/
    // context fields but the alternative's actual action/category, since
    // the alternative itself only carries action/rationale/score/
    // actionCategory, not a full Recommendation shape.
    const alternativeAsRecommendation = {
      ...recommendation,
      action: alternative.action,
      rationale: alternative.rationale,
      actionCategory: alternative.actionCategory,
      confidence: Math.max(0, Math.min(1, alternative.score / 100)),
      alternatives: [],
    };

    // Discard any prior (e.g. rejected) approval on this recommendation
    // id — trying an alternative is a fresh decision on a different
    // action, not a re-decision of the same one.
    const nextApprovals = { ...state.approvals };
    delete nextApprovals[recommendationId];

    runApprovalPipeline(set, get, {
      analysis,
      recommendationId,
      actionToRun: alternativeAsRecommendation,
      approvalsOverride: nextApprovals,
    });
  },
}));

/**
 * Shared Approval -> Execution Simulation -> Verification pipeline used
 * by both approveRecommendation (primary action) and tryAlternative (an
 * alternative action run in the primary's place). Factored out so the
 * two call sites can't drift out of sync on what "approving an action"
 * actually does.
 */
function runApprovalPipeline(
  set: (partial: Partial<AgentStoreState>) => void,
  get: () => AgentStoreState,
  input: {
    analysis: SignalAnalysis;
    recommendationId: string;
    actionToRun: Recommendation;
    /** Pass when the caller has already computed a modified approvals
     * map (e.g. tryAlternative clearing a prior rejection) that should
     * be used as the base instead of the live store state. */
    approvalsOverride?: Record<string, ApprovalResult>;
  }
): void {
  const { analysis, recommendationId, actionToRun } = input;
  const state = get();
  const approvalsBase = input.approvalsOverride ?? state.approvals;
  const decidedAt = state.asOf;

  // 1. Classify + apply the human decision through the Approval Engine.
  const starting =
    approvalsBase[recommendationId] ?? runApprovalEngine({ recommendation: actionToRun }).data;
  const decided = decideApproval({
    current: starting,
    decision: "approve",
    decidedBy: "user",
    decidedAt,
  });
  if (!decided.ok) {
    console.warn(decided.warnings.join(" "));
    return;
  }

  // 2. Execution simulation: apply the action against real project
  // entities and see what's actually achievable right now.
  const project = useProjectStore.getState();
  const effect = runExecutionSimulation({
    actionCategory: actionToRun.actionCategory,
    relatedTaskId: analysis.signal.relatedTaskId,
    relatedEntityId: analysis.signal.relatedEntityId,
    crews: project.crews,
    equipment: project.equipment,
    inspections: project.inspections,
  });
  if (effect.updatedCrews) project.applyCrewUpdates(effect.updatedCrews);
  if (effect.updatedEquipment) project.applyEquipmentUpdates(effect.updatedEquipment);
  if (effect.updatedInspections) project.applyInspectionUpdates(effect.updatedInspections);

  // 3. Verification Engine decides the outcome from that effect.
  const verification = runVerificationEngine({
    recommendation: actionToRun,
    effect,
    checkedAt: decidedAt,
  }).data;

  // 4. Signal status: resolved closes the loop; otherwise it moves to
  // verification_pending with a next-best action surfaced (Architecture
  // Section 13: "partially resolved -> keep open + next action",
  // "unresolved -> escalate + recommend alternative").
  const nextStatus: ProjectSignal["status"] =
    verification.outcome === "resolved" ? "resolved" : "verification_pending";

  const nextOverrides = {
    ...state.signalOverrides,
    [analysis.signal.id]: {
      ...state.signalOverrides[analysis.signal.id],
      status: nextStatus,
      updatedAt: decidedAt,
    },
  };

  const output = recompute(state.revealedSignalIds, state.asOf, nextOverrides);

  // buildTimelineFromAnalyses (re-run inside recompute) already adds a
  // "Resolved" verification.completed event when signal.status ends up
  // "resolved". Partially-resolved/unresolved outcomes have no signal
  // status change it can key off of, so log those explicitly here.
  const extraEvents: TimelineEvent[] = [
    {
      id: `evt_${analysis.signal.id}_approved_${decidedAt}`,
      projectId: seedProject.id,
      type: "approval.approved",
      timestamp: decidedAt,
      title: "Action approved",
      description: `${actionToRun.action} — approved by user.`,
      relatedSignalId: analysis.signal.id,
      relatedRecommendationId: recommendationId,
      severity: analysis.priority.tier,
      evidenceIds: [],
    },
  ];
  if (verification.outcome !== "resolved") {
    extraEvents.push({
      id: `evt_${analysis.signal.id}_verified_${decidedAt}`,
      projectId: seedProject.id,
      type: "verification.completed",
      timestamp: decidedAt,
      title: verification.outcome === "partially_resolved" ? "Partially resolved" : "Unresolved",
      description: verification.resultSummary,
      relatedSignalId: analysis.signal.id,
      relatedRecommendationId: recommendationId,
      severity: analysis.priority.tier,
      evidenceIds: [],
    });
  }

  set({
    signalOverrides: nextOverrides,
    approvals: { ...approvalsBase, [recommendationId]: decided.data },
    verifications: { ...state.verifications, [recommendationId]: verification },
    analyses: output.analyses,
    health: output.health,
    drift: output.drift,
    timeline: [...output.timeline, ...extraEvents],
    topBlocker: output.topBlocker,
  });
}

/**
 * Recommendation Queue selector: active Tier 1/2 analyses with a
 * non-null recommendation, ranked by attention score. Source: SoT v2.0
 * Section 11 (Recommendation Queue panel spec).
 *
 * NOTE: this takes `analyses` directly rather than the full store state
 * and is NOT meant to be passed straight into `useAgentStore(...)` as a
 * selector. Passing a function that builds a new array every call
 * directly into Zustand's selector causes an infinite render loop,
 * because Zustand compares the selector's return value by reference on
 * every render — a freshly sorted/filtered array never matches the
 * previous one, so `getSnapshot` never stabilizes. Instead, select the
 * raw `analyses` array (a stable reference) and derive with `useMemo` in
 * the component — see LiveSignalFeed.tsx / RecommendationQueue.tsx.
 */
export function selectRecommendationQueue(
  analyses: SignalAnalysis[]
): SignalAnalysis[] {
  return analyses
    .filter((a) => a.recommendation !== null && a.signal.status !== "archived")
    .sort((a, b) => b.priority.attentionScore - a.priority.attentionScore);
}

/** Live Signal Feed selector: all signals, newest first. Source: SoT v2.0
 * Section 11 (Live Signal Feed panel spec — "newest first"). See the note
 * on selectRecommendationQueue above — same usage pattern applies. */
export function selectLiveSignalFeed(analyses: SignalAnalysis[]): SignalAnalysis[] {
  return [...analyses].sort(
    (a, b) => new Date(b.signal.createdAt).getTime() - new Date(a.signal.createdAt).getTime()
  );
}
