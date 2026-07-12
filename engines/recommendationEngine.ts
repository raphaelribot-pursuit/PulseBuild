import {
  ProjectSignal,
  PriorityOutput,
  DependencyOutput,
  PredictionOutput,
  Recommendation,
  RecommendationAlternative,
  OperationalIntent,
  EngineResult,
  EvidenceItem,
  Task,
  Crew,
  Material,
  Equipment,
  SignalType,
} from "@/domain/types";
import {
  SIGNAL_PRIORITY_MATRIX,
} from "@/domain/rules/signalPriorityMatrix";
import { ActionCategory, APPROVAL_RULES } from "@/domain/rules/approvalRules";

/**
 * Recommendation Engine (basics)
 * Source: Cognitive & Reasoning Spec, Section 9 (Recommendation
 * Intelligence — Generate, Evaluate, Rank, Recommend) and Section 22
 * (Operational Intent Engine).
 *
 * Pure function. Every recommendation must be traceable to seeded data —
 * this engine only ever references real task/crew/material/equipment
 * names and IDs that were passed in, never invented text.
 *
 * MVP scope note: this is "recommendation basics" per the Phase 3 plan.
 * Multi-option scenario simulation (Cognitive Spec Section 28) and full
 * conflict resolution (Section 12) are deferred; this engine produces one
 * primary recommendation plus up to two grounded alternatives per signal
 * type, which is enough to drive the Recommendation Queue UI in Phase 4.
 */

export interface RecommendationEngineInput {
  signal: ProjectSignal;
  priority: PriorityOutput;
  dependencies: DependencyOutput;
  prediction: PredictionOutput;
  tasks: Task[];
  crews: Crew[];
  materials: Material[];
  equipment: Equipment[];
}

interface SignalRecommendationTemplate {
  intent: OperationalIntent;
  secondaryIntents?: OperationalIntent[];
  actionCategory: ActionCategory;
  buildAction: (ctx: TemplateContext) => string;
  buildRationale: (ctx: TemplateContext) => string;
  alternatives: Array<{
    actionCategory: ActionCategory;
    buildAction: (ctx: TemplateContext) => string;
    buildRationale: (ctx: TemplateContext) => string;
    scoreOffset: number;
  }>;
}

interface TemplateContext {
  signal: ProjectSignal;
  task?: Task;
  crews: Crew[];
  materials: Material[];
  equipment: Equipment[];
  dependencies: DependencyOutput;
}

function assignedCrewNames(ctx: TemplateContext): string {
  if (!ctx.task) return "the assigned crew";
  const names = ctx.task.requiredCrewIds
    .map((id) => ctx.crews.find((c) => c.id === id)?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "the assigned crew";
}

function relatedMaterialName(ctx: TemplateContext): string {
  const material = ctx.materials.find((m) => m.id === ctx.signal.relatedEntityId);
  return material?.name ?? "the required material";
}

function relatedEquipmentName(ctx: TemplateContext): string {
  const eq = ctx.equipment.find((e) => e.id === ctx.signal.relatedEntityId);
  return eq?.name ?? "the required equipment";
}

function taskName(ctx: TemplateContext): string {
  return ctx.task?.name ?? "the affected task";
}

const TEMPLATES: Partial<
  Record<SignalType, SignalRecommendationTemplate>
> = {
  material_delivery_delayed: {
    intent: "restore_material_flow",
    secondaryIntents: ["restore_productivity"],
    actionCategory: "crew_reassignment",
    buildAction: (ctx) =>
      `Reassign ${assignedCrewNames(ctx)} to available indoor prep work while ${relatedMaterialName(
        ctx
      )} delivery is delayed.`,
    buildRationale: (ctx) =>
      `${taskName(ctx)} cannot proceed without ${relatedMaterialName(
        ctx
      )}. Moving the crew to available prep work avoids idle labor while the delivery is in transit.`,
    alternatives: [
      {
        actionCategory: "notification_only",
        buildAction: (ctx) =>
          `Wait for the revised delivery ETA on ${relatedMaterialName(ctx)} and hold the crew.`,
        buildRationale: () =>
          "Lowest disruption, but leaves the crew idle for the full delay window.",
        scoreOffset: -15,
      },
      {
        actionCategory: "task_resequence",
        buildAction: (ctx) =>
          `Resequence the schedule to pull forward a task not blocked by ${relatedMaterialName(ctx)}.`,
        buildRationale: () =>
          "Keeps the crew productive on already-planned work, but requires re-coordinating downstream dates.",
        scoreOffset: -5,
      },
    ],
  },

  inspection_missing: {
    intent: "maintain_compliance",
    secondaryIntents: ["protect_critical_path"],
    actionCategory: "inspection_reschedule",
    buildAction: (ctx) =>
      `Schedule the required inspection for ${taskName(ctx)} before work resumes.`,
    buildRationale: (ctx) =>
      `${taskName(ctx)} cannot legally or safely proceed without a completed inspection. This is blocking dependent work.`,
    alternatives: [
      {
        actionCategory: "crew_reassignment",
        buildAction: (ctx) =>
          `Move ${assignedCrewNames(ctx)} to non-blocked prep work until the inspection is scheduled.`,
        buildRationale: () =>
          "Reduces idle labor risk while waiting on the inspection to be booked.",
        scoreOffset: -8,
      },
    ],
  },

  critical_equipment_failure: {
    intent: "restore_productivity",
    secondaryIntents: ["protect_critical_path"],
    actionCategory: "equipment_reassignment",
    buildAction: (ctx) =>
      `Assign backup equipment to cover ${taskName(ctx)} while ${relatedEquipmentName(ctx)} is down.`,
    buildRationale: (ctx) =>
      `${relatedEquipmentName(ctx)} is required for ${taskName(ctx)} and is currently unavailable.`,
    alternatives: [
      {
        actionCategory: "task_resequence",
        buildAction: (ctx) =>
          `Resequence ${taskName(ctx)} behind non-equipment-dependent work until ${relatedEquipmentName(ctx)} is restored.`,
        buildRationale: () =>
          "Avoids rental cost of backup equipment, but extends the delay on this task.",
        scoreOffset: -10,
      },
    ],
  },

  crew_shortage: {
    intent: "restore_crew_flow",
    secondaryIntents: ["restore_productivity"],
    actionCategory: "crew_reassignment",
    buildAction: (ctx) =>
      `Backfill ${assignedCrewNames(ctx)} from another crew or reduce ${taskName(ctx)} scope for today.`,
    buildRationale: (ctx) =>
      `${taskName(ctx)} is below its required worker count, risking schedule slip.`,
    alternatives: [
      {
        actionCategory: "task_resequence",
        buildAction: (ctx) =>
          `Reduce today's scope on ${taskName(ctx)} to match available headcount and resume full scope tomorrow.`,
        buildRationale: () => "Avoids pulling workers from another crew's task.",
        scoreOffset: -6,
      },
    ],
  },

  weather_alert: {
    intent: "restore_productivity",
    secondaryIntents: ["protect_quality"],
    actionCategory: "task_resequence",
    buildAction: (ctx) =>
      `Move ${assignedCrewNames(ctx)} to indoor work until the weather window clears, then resume ${taskName(ctx)}.`,
    buildRationale: (ctx) =>
      `${taskName(ctx)} is weather-sensitive and current conditions conflict with safe or quality execution.`,
    alternatives: [
      {
        actionCategory: "notification_only",
        buildAction: (ctx) =>
          `Hold ${taskName(ctx)} and monitor the forecast for an earlier clearing window.`,
        buildRationale: () => "Simplest option, but leaves the crew idle if the window doesn't clear soon.",
        scoreOffset: -12,
      },
    ],
  },

  permit_pending: {
    intent: "maintain_compliance",
    actionCategory: "permit_change",
    buildAction: (ctx) =>
      `Notify the coordinator to expedite the pending permit blocking ${taskName(ctx)}.`,
    buildRationale: (ctx) =>
      `${taskName(ctx)} requires an approved permit before it can start.`,
    alternatives: [],
  },

  task_behind_schedule: {
    intent: "restore_productivity",
    secondaryIntents: ["protect_critical_path"],
    actionCategory: "task_resequence",
    buildAction: (ctx) =>
      `Assess downstream impact on ${taskName(ctx)} and recommend a recovery plan to close the progress gap.`,
    buildRationale: (ctx) =>
      `${taskName(ctx)} is behind its planned progress, risking downstream schedule slip.`,
    alternatives: [
      {
        actionCategory: "crew_reassignment",
        buildAction: (ctx) =>
          `Add support labor to ${assignedCrewNames(ctx)} to accelerate ${taskName(ctx)}.`,
        buildRationale: () => "Directly closes the progress gap, at the cost of pulling labor from elsewhere.",
        scoreOffset: -4,
      },
    ],
  },

  safety_incident: {
    intent: "protect_safety",
    actionCategory: "safety_review",
    buildAction: (ctx) =>
      `Stop automated actions on ${taskName(ctx)} and require immediate human safety review.`,
    buildRationale: () =>
      "Safety always overrides productivity. This cannot be resolved autonomously.",
    alternatives: [],
  },

  inspection_failed: {
    intent: "maintain_compliance",
    secondaryIntents: ["protect_quality"],
    actionCategory: "inspection_reschedule",
    buildAction: (ctx) =>
      `Block work dependent on ${taskName(ctx)} and schedule a recovery inspection.`,
    buildRationale: (ctx) =>
      `${taskName(ctx)} failed its required inspection and cannot proceed until it passes.`,
    alternatives: [],
  },
};

const NO_RECOMMENDATION_TIERS = new Set(["Tier3", "Tier4"]);

export function runRecommendationEngine(
  input: RecommendationEngineInput
): EngineResult<Recommendation | null> {
  const { signal, priority, dependencies, prediction, tasks, crews, materials, equipment } =
    input;
  const warnings: string[] = [];
  const evidence: EvidenceItem[] = [];

  // SoT v2.0 Section 3: "Every Tier 1 and Tier 2 signal must generate a
  // recommendation." Tier 3/4 signals are monitored, not acted on.
  if (NO_RECOMMENDATION_TIERS.has(priority.tier)) {
    return {
      ok: true,
      data: null,
      warnings: [`${priority.tier} signals do not require a recommendation.`],
      confidence: 1,
      evidence,
    };
  }

  const template = TEMPLATES[signal.type];
  if (!template) {
    warnings.push(`No recommendation template for signal type ${signal.type}.`);
    return {
      ok: false,
      data: null,
      warnings,
      confidence: 0.2,
      evidence,
    };
  }

  const task = tasks.find((t) => t.id === signal.relatedTaskId);
  if (!task) {
    warnings.push(
      `relatedTaskId ${signal.relatedTaskId} not found; recommendation text may be generic.`
    );
  }

  const ctx: TemplateContext = { signal, task, crews, materials, equipment, dependencies };

  const approvalRule = APPROVAL_RULES[template.actionCategory];
  evidence.push({
    label: "Approval basis",
    detail: approvalRule.reason,
  });

  const alternatives: RecommendationAlternative[] = template.alternatives.map(
    (alt) => ({
      action: alt.buildAction(ctx),
      rationale: alt.buildRationale(ctx),
      // Base score derived from prediction confidence so alternatives are
      // ranked relative to the primary action, not invented out of thin air.
      score: Math.round((prediction.recoveryDurationHours ?? 0) > 0 ? 70 + alt.scoreOffset : 60 + alt.scoreOffset),
      actionCategory: alt.actionCategory,
    })
  );

  const verificationChecks = [SIGNAL_PRIORITY_MATRIX[signal.type]?.verificationCheck].filter(
    (c): c is string => Boolean(c)
  );
  verificationChecks.push("Health score does not continue declining from this signal.");

  const confidence = Math.min(
    0.98,
    Math.max(0.3, (priority.attentionScore > 0 ? 0.6 : 0.4) + (task ? 0.25 : 0) )
  );

  const recommendation: Recommendation = {
    id: `rec_${signal.id}`,
    signalId: signal.id,
    intent: template.intent,
    secondaryIntents: template.secondaryIntents,
    actionCategory: template.actionCategory,
    action: template.buildAction(ctx),
    rationale: template.buildRationale(ctx),
    expectedBenefit: `Reduces projected delay (currently ~${prediction.estimatedDelayHours}h) and limits health/drift impact.`,
    tradeoffs:
      alternatives.length > 0
        ? ["See alternatives for lower-disruption options with different tradeoffs."]
        : [],
    confidence,
    requiresApproval: approvalRule.requiresApproval || approvalRule.neverAutonomous,
    approvalReason: approvalRule.reason,
    verificationPlan: {
      checks: verificationChecks,
      expectedSignal: `${signal.type} status moves toward resolved for ${signal.relatedTaskId ?? "the affected task"}.`,
    },
    alternatives,
  };

  return {
    ok: true,
    data: recommendation,
    warnings,
    confidence,
    evidence,
  };
}
