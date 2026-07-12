import {
  ProjectSignal,
  DependencyOutput,
  PriorityOutput,
  EngineResult,
  EvidenceItem,
  PriorityTier,
} from "@/domain/types";
import {
  SIGNAL_PRIORITY_MATRIX,
  escalate,
} from "@/domain/rules/signalPriorityMatrix";

/**
 * Priority Engine
 * Source: SoT v2.0 Section 9 (Signal Taxonomy and Priority Matrix,
 * including the escalation rule: "Priority may be upgraded when multiple
 * low-risk signals combine") + Cognitive & Reasoning Spec Section 8
 * (Attention Model).
 *
 * Pure function. Determines the tier for a signal and an attention score
 * used to rank it against other active signals.
 */

export interface PriorityEngineInput {
  signal: ProjectSignal;
  dependencies: DependencyOutput;
  /** Other currently-active signals, used for the combined-signal
   * escalation rule (same task, multiple concurrent issues). */
  activeSignals: ProjectSignal[];
}

const TERMINAL_STATUSES = new Set(["resolved", "archived"]);

/** Attention Model weights (Cognitive Spec Section 8). Financial exposure,
 * customer visibility, and time sensitivity are not modeled in the MVP
 * seed schema, so they are omitted rather than faked. */
const ATTENTION_WEIGHTS = {
  tierBase: { Tier1: 100, Tier2: 60, Tier3: 25, Tier4: 5 } as Record<
    PriorityTier,
    number
  >,
  perAffectedTask: 4,
  criticalPathBonus: 20,
  cascadeDepthMultiplier: 5,
  perIdleCrew: 8,
};

export function runPriorityEngine(
  input: PriorityEngineInput
): EngineResult<PriorityOutput> {
  const { signal, dependencies, activeSignals } = input;
  const warnings: string[] = [];
  const evidence: EvidenceItem[] = [];

  const matrixEntry = SIGNAL_PRIORITY_MATRIX[signal.type];
  if (!matrixEntry) {
    warnings.push(`No priority matrix entry for signal type ${signal.type}.`);
  }

  let tier: PriorityTier = matrixEntry?.defaultTier ?? "Tier3";
  evidence.push({
    label: "Default tier",
    detail: `${signal.type} defaults to ${tier} per the signal taxonomy.`,
  });

  // Escalation rule (SoT Section 9): if another active signal targets the
  // same task, priority may be upgraded — productive work is blocked from
  // more than one direction at once.
  const concurrentOnSameTask = activeSignals.filter(
    (s) =>
      s.id !== signal.id &&
      s.relatedTaskId &&
      s.relatedTaskId === signal.relatedTaskId &&
      !TERMINAL_STATUSES.has(s.status)
  );

  if (concurrentOnSameTask.length > 0 && tier !== "Tier1") {
    const escalated = escalate(tier);
    evidence.push({
      label: "Combined signal escalation",
      detail: `${concurrentOnSameTask.length} other active signal(s) affect the same task (${signal.relatedTaskId}); tier escalated from ${tier} to ${escalated}.`,
    });
    tier = escalated;
  }

  // Critical path + deep cascade can also escalate a Tier 2 signal, since
  // it threatens more of the schedule than a typical Tier 2 event.
  if (
    tier === "Tier2" &&
    dependencies.criticalPathImpact &&
    dependencies.cascadeDepth >= 3
  ) {
    const escalated = escalate(tier);
    evidence.push({
      label: "Critical path escalation",
      detail: `Signal sits on the critical path with a cascade depth of ${dependencies.cascadeDepth}; tier escalated to ${escalated}.`,
    });
    tier = escalated;
  }

  // Attention score
  let attentionScore = ATTENTION_WEIGHTS.tierBase[tier];
  attentionScore +=
    dependencies.affectedTaskIds.length * ATTENTION_WEIGHTS.perAffectedTask;
  attentionScore +=
    dependencies.cascadeDepth * ATTENTION_WEIGHTS.cascadeDepthMultiplier;
  if (dependencies.criticalPathImpact) {
    attentionScore += ATTENTION_WEIGHTS.criticalPathBonus;
  }
  attentionScore +=
    dependencies.affectedCrewIds.length * ATTENTION_WEIGHTS.perIdleCrew;

  const explanationParts = [
    `Classified as ${tier}.`,
    `${dependencies.affectedTaskIds.length} task(s) affected`,
    dependencies.criticalPathImpact ? "on critical path" : "off critical path",
    `cascade depth ${dependencies.cascadeDepth}.`,
  ];

  return {
    ok: true,
    data: {
      tier,
      attentionScore: Math.round(attentionScore),
      explanation: explanationParts.join(" "),
    },
    warnings,
    confidence: matrixEntry ? 0.9 : 0.5,
    evidence,
  };
}
