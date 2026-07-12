import {
  ProjectSignal,
  PriorityOutput,
  DependencyOutput,
  HealthState,
  HealthDomainScore,
  EngineResult,
  EvidenceItem,
  SignalType,
} from "@/domain/types";
import {
  HEALTH_START,
  HEALTH_TIER_PENALTY,
  HEALTH_PER_AFFECTED_TASK_PENALTY,
  HEALTH_UNRESOLVED_RECOMMENDATION_PENALTY,
  HEALTH_VERIFIED_RECOVERY_BONUS_MAX,
} from "@/domain/rules/scoringWeights";

/**
 * Health Engine
 * Source: SoT v2.0 Section 10 — "Start at 100. Tier 1 subtracts 20; Tier 2
 * subtracts 10; Tier 3 subtracts 5. Each affected downstream task
 * subtracts 2. Unresolved recommendation subtracts 5. Verified recovery
 * adds back up to 5."
 * Domain breakdown source: Cognitive & Reasoning Spec Section 23
 * (Operational Health Model).
 *
 * Pure function over a set of signal evaluations (each signal paired with
 * its already-computed priority and dependency output, so this engine
 * doesn't need to re-run those engines itself).
 */

export interface SignalEvaluation {
  signal: ProjectSignal;
  priority: PriorityOutput;
  dependencies: DependencyOutput;
  /** Whether this signal currently has a recommendation awaiting action.
   * Tier 1/2 signals that haven't reached action_taken/resolved/archived
   * count as an unresolved recommendation per SoT Section 10. */
  hasUnresolvedRecommendation: boolean;
}

export interface HealthEngineInput {
  evaluations: SignalEvaluation[];
  updatedAt: string;
}

const TERMINAL_STATUSES = new Set(["resolved", "archived"]);

/** Cognitive Spec Section 23 domains. Not every signal type in the MVP
 * taxonomy maps to one — "quality" and "communication" have no seeded
 * signal source and will simply hold a full score with a flat trend. */
const DOMAIN_BY_SIGNAL_TYPE: Partial<
  Record<SignalType, HealthDomainScore["domain"]>
> = {
  safety_incident: "safety",
  inspection_failed: "inspection",
  inspection_missing: "inspection",
  critical_equipment_failure: "equipment",
  material_delivery_delayed: "material",
  crew_shortage: "resource",
  weather_alert: "schedule",
  permit_pending: "schedule",
  task_behind_schedule: "productivity",
  minor_delay: "productivity",
};

const ALL_DOMAINS: HealthDomainScore["domain"][] = [
  "productivity",
  "schedule",
  "resource",
  "material",
  "equipment",
  "safety",
  "quality",
  "communication",
  "inspection",
];

export function runHealthEngine(
  input: HealthEngineInput
): EngineResult<HealthState> {
  const { evaluations, updatedAt } = input;
  const warnings: string[] = [];
  const evidence: EvidenceItem[] = [];

  let overall = HEALTH_START;
  let recoveredCount = 0;

  const domainPenalty = new Map<HealthDomainScore["domain"], number>();
  const domainHasActiveIssue = new Map<HealthDomainScore["domain"], boolean>();
  const domainConfidences = new Map<HealthDomainScore["domain"], number[]>();
  const domainPrimaryRisk = new Map<HealthDomainScore["domain"], string>();

  for (const evalItem of evaluations) {
    const { signal, priority, dependencies, hasUnresolvedRecommendation } = evalItem;
    const isActive = !TERMINAL_STATUSES.has(signal.status);
    const domain = DOMAIN_BY_SIGNAL_TYPE[signal.type];

    if (isActive) {
      const tierPenalty = HEALTH_TIER_PENALTY[priority.tier];
      const taskPenalty =
        dependencies.affectedTaskIds.length * HEALTH_PER_AFFECTED_TASK_PENALTY;
      let signalPenalty = tierPenalty + taskPenalty;

      if (hasUnresolvedRecommendation) {
        signalPenalty += HEALTH_UNRESOLVED_RECOMMENDATION_PENALTY;
      }

      overall -= signalPenalty;

      evidence.push({
        label: `${signal.type} (${priority.tier})`,
        detail: `-${signalPenalty} (tier ${tierPenalty}, ${dependencies.affectedTaskIds.length} affected task(s) ${taskPenalty}${
          hasUnresolvedRecommendation ? `, unresolved recommendation ${HEALTH_UNRESOLVED_RECOMMENDATION_PENALTY}` : ""
        })`,
        sourceEntityId: signal.id,
      });

      if (domain) {
        domainPenalty.set(domain, (domainPenalty.get(domain) ?? 0) + signalPenalty);
        domainHasActiveIssue.set(domain, true);
        if (!domainPrimaryRisk.has(domain)) {
          domainPrimaryRisk.set(domain, `${signal.type} on ${signal.relatedTaskId ?? "unspecified task"}`);
        }
      }
    } else if (signal.status === "resolved") {
      recoveredCount += 1;
    }

    if (domain) {
      const list = domainConfidences.get(domain) ?? [];
      list.push(priority.attentionScore > 0 ? priority.attentionScore / 100 : 0.5);
      domainConfidences.set(domain, list);
    }
  }

  const recoveryBonus = Math.min(
    recoveredCount * HEALTH_VERIFIED_RECOVERY_BONUS_MAX,
    HEALTH_VERIFIED_RECOVERY_BONUS_MAX
  );
  if (recoveryBonus > 0) {
    overall += recoveryBonus;
    evidence.push({
      label: "Verified recovery bonus",
      detail: `+${recoveryBonus} from ${recoveredCount} resolved signal(s).`,
    });
  }

  overall = Math.max(0, Math.min(100, Math.round(overall)));

  const domains: HealthDomainScore[] = ALL_DOMAINS.map((domain) => {
    const penalty = domainPenalty.get(domain) ?? 0;
    const score = Math.max(0, Math.min(100, HEALTH_START - penalty));
    const confidences = domainConfidences.get(domain) ?? [];
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0.6;

    return {
      domain,
      score,
      trend: domainHasActiveIssue.get(domain) ? "down" : "flat",
      confidence: Math.round(avgConfidence * 100) / 100,
      primaryRisk: domainPrimaryRisk.get(domain),
      recommendedRecovery: domainPrimaryRisk.has(domain)
        ? "See Recommendation Queue for the related signal."
        : undefined,
    };
  });

  return {
    ok: true,
    data: {
      overall,
      domains,
      updatedAt,
    },
    warnings,
    confidence: 0.85,
    evidence,
  };
}
