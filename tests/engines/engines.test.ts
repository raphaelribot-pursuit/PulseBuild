import { describe, it, expect } from "vitest";
import {
  seedTasks,
  seedCrews,
  seedMaterials,
  seedEquipment,
  seedSignals,
} from "@/data";
import {
  runDependencyEngine,
  findCriticalPath,
  findDownstreamTasks,
  cascadeDepthFrom,
} from "@/engines/dependencyEngine";
import { runPriorityEngine } from "@/engines/priorityEngine";
import { runPredictionEngine } from "@/engines/predictionEngine";
import { runRecommendationEngine } from "@/engines/recommendationEngine";
import { runHealthEngine, SignalEvaluation } from "@/engines/healthEngine";
import { runDriftEngine } from "@/engines/driftEngine";
import { ProjectSignal } from "@/domain/types";

const TERMINAL_STATUSES = new Set(["resolved", "archived"]);
// Kept in sync with agent/agentOrchestrator.ts's ADDRESSED_STATUSES fix —
// "verification_pending" means a decision was already recorded (possibly
// partial/unresolved), not that the signal is untouched.
const ADDRESSED_STATUSES = new Set(["action_taken", "verification_pending"]);

/**
 * Composes dependency -> priority for every seeded signal. This mirrors
 * what the Agent Orchestrator will do in Phase 4, but stays test-local for
 * now since orchestration wiring is out of Phase 3 scope.
 */
function evaluateAllSignals(signals: ProjectSignal[]): SignalEvaluation[] {
  return signals.map((signal) => {
    const depResult = runDependencyEngine({
      signal,
      tasks: seedTasks,
      crews: seedCrews,
    });
    const priorityResult = runPriorityEngine({
      signal,
      dependencies: depResult.data,
      activeSignals: signals,
    });
    const isActive = !TERMINAL_STATUSES.has(signal.status);
    const requiresRecommendation =
      priorityResult.data.tier === "Tier1" || priorityResult.data.tier === "Tier2";
    const hasUnresolvedRecommendation =
      isActive && requiresRecommendation && !ADDRESSED_STATUSES.has(signal.status);

    return {
      signal,
      priority: priorityResult.data,
      dependencies: depResult.data,
      hasUnresolvedRecommendation,
    };
  });
}

describe("Dependency Engine", () => {
  it("finds the correct downstream chain for the slab pour (critical path anchor)", () => {
    const downstream = findDownstreamTasks("task_slab_pour", seedTasks);
    expect(downstream).toEqual(
      expect.arrayContaining([
        "task_framing_l1",
        "task_framing_l2",
        "task_electrical_rough",
        "task_plumbing_rough",
        "task_hvac_rough",
        "task_drywall_l1",
        "task_flooring_l1",
        "task_fixtures",
        "task_final_inspection",
        "task_occupancy",
      ])
    );
    expect(downstream.length).toBe(10);
  });

  it("finds the correct downstream chain for framing L2 (mid-graph)", () => {
    const downstream = findDownstreamTasks("task_framing_l2", seedTasks);
    expect(downstream).toEqual(
      expect.arrayContaining([
        "task_electrical_rough",
        "task_plumbing_rough",
        "task_hvac_rough",
        "task_drywall_l1",
        "task_flooring_l1",
        "task_fixtures",
        "task_final_inspection",
        "task_occupancy",
      ])
    );
  });

  it("finds no downstream tasks for a terminal task", () => {
    const downstream = findDownstreamTasks("task_occupancy", seedTasks);
    expect(downstream).toEqual([]);
  });

  it("calculates cascade depth correctly from the slab pour to occupancy", () => {
    const depth = cascadeDepthFrom("task_slab_pour", seedTasks);
    expect(depth).toBe(7);
  });

  it("identifies the full 11-task critical path from site clearing through occupancy", () => {
    const criticalPath = findCriticalPath(seedTasks);
    expect(criticalPath).toEqual([
      "task_site_clear",
      "task_excavation",
      "task_footings",
      "task_slab_pour",
      "task_framing_l1",
      "task_framing_l2",
      "task_electrical_rough",
      "task_drywall_l1",
      "task_flooring_l1",
      "task_final_inspection",
      "task_occupancy",
    ]);
  });

  it("flags critical path impact for a signal on the slab pour", () => {
    const signal = seedSignals.find((s) => s.id === "sig_03_inspection_missing")!;
    const result = runDependencyEngine({
      signal,
      tasks: seedTasks,
      crews: seedCrews,
    });
    expect(result.ok).toBe(true);
    expect(result.data.criticalPathImpact).toBe(true);
  });

  it("does not flag critical path impact for an off-path task", () => {
    const signal = seedSignals.find((s) => s.id === "sig_04_crew_shortage")!;
    // sig_04 is on task_framing_l1, which IS on the critical path — use a
    // genuinely off-path task instead to confirm the negative case.
    const offPathSignal: ProjectSignal = {
      ...signal,
      relatedTaskId: "task_interior_prep",
    };
    const result = runDependencyEngine({
      signal: offPathSignal,
      tasks: seedTasks,
      crews: seedCrews,
    });
    expect(result.data.criticalPathImpact).toBe(false);
  });

  it("returns a warning and low confidence when relatedTaskId is missing", () => {
    const signal = seedSignals[0];
    const result = runDependencyEngine({
      signal: { ...signal, relatedTaskId: undefined },
      tasks: seedTasks,
      crews: seedCrews,
    });
    expect(result.ok).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("Priority Engine", () => {
  it("classifies all seeded Tier 1 signal types as Tier 1 by default", () => {
    const tier1Types = [
      "safety_incident",
      "inspection_failed",
      "inspection_missing",
      "critical_equipment_failure",
    ];
    for (const signal of seedSignals.filter((s) => tier1Types.includes(s.type))) {
      const dep = runDependencyEngine({ signal, tasks: seedTasks, crews: seedCrews });
      const result = runPriorityEngine({
        signal,
        dependencies: dep.data,
        activeSignals: seedSignals,
      });
      expect(result.data.tier).toBe("Tier1");
    }
  });

  it("escalates a Tier 2 signal to Tier 1 when a concurrent Tier 1 signal shares the same task", () => {
    // sig_02 (material delay, default Tier2) shares task_slab_pour with
    // sig_03 (inspection missing, Tier1) — SoT Section 9's combined
    // signal escalation rule should kick in.
    const signal = seedSignals.find((s) => s.id === "sig_02_material_delay")!;
    const dep = runDependencyEngine({ signal, tasks: seedTasks, crews: seedCrews });
    const result = runPriorityEngine({
      signal,
      dependencies: dep.data,
      activeSignals: seedSignals,
    });
    expect(result.data.tier).toBe("Tier1");
    expect(
      result.evidence.some((e) => e.label === "Combined signal escalation")
    ).toBe(true);
  });

  it("does not escalate a Tier 2 signal with no concurrent signals on its task", () => {
    const signal = seedSignals.find((s) => s.id === "sig_07_task_behind")!;
    const otherActive = seedSignals.filter(
      (s) => s.id !== signal.id && s.relatedTaskId !== signal.relatedTaskId
    );
    const dep = runDependencyEngine({ signal, tasks: seedTasks, crews: seedCrews });
    const result = runPriorityEngine({
      signal,
      dependencies: dep.data,
      activeSignals: [signal, ...otherActive],
    });
    expect(result.data.tier).toBe("Tier2");
  });

  it("gives Tier 1 signals a higher attention score than Tier 4 signals", () => {
    const tier1Signal = seedSignals.find((s) => s.id === "sig_03_inspection_missing")!;
    const tier4Signal = seedSignals.find((s) => s.id === "sig_10_rebar_received")!;

    const dep1 = runDependencyEngine({ signal: tier1Signal, tasks: seedTasks, crews: seedCrews });
    const dep4 = runDependencyEngine({ signal: tier4Signal, tasks: seedTasks, crews: seedCrews });

    const p1 = runPriorityEngine({ signal: tier1Signal, dependencies: dep1.data, activeSignals: seedSignals });
    const p4 = runPriorityEngine({ signal: tier4Signal, dependencies: dep4.data, activeSignals: seedSignals });

    expect(p1.data.attentionScore).toBeGreaterThan(p4.data.attentionScore);
  });
});

describe("Prediction Engine", () => {
  it("produces a longer estimated delay for signals with deeper cascades", () => {
    const shallowSignal = seedSignals.find((s) => s.id === "sig_08_minor_delay")!;
    const deepSignal = seedSignals.find((s) => s.id === "sig_03_inspection_missing")!;

    const depShallow = runDependencyEngine({ signal: shallowSignal, tasks: seedTasks, crews: seedCrews });
    const depDeep = runDependencyEngine({ signal: deepSignal, tasks: seedTasks, crews: seedCrews });

    const priorityShallow = runPriorityEngine({ signal: shallowSignal, dependencies: depShallow.data, activeSignals: seedSignals });
    const priorityDeep = runPriorityEngine({ signal: deepSignal, dependencies: depDeep.data, activeSignals: seedSignals });

    const predShallow = runPredictionEngine({
      signal: shallowSignal,
      priority: priorityShallow.data,
      dependencies: depShallow.data,
    });
    const predDeep = runPredictionEngine({
      signal: deepSignal,
      priority: priorityDeep.data,
      dependencies: depDeep.data,
    });

    expect(predDeep.data.estimatedDelayHours).toBeGreaterThan(
      predShallow.data.estimatedDelayHours
    );
  });

  it("flags idle labor risk when crews are affected on a Tier 1/2 signal", () => {
    const signal = seedSignals.find((s) => s.id === "sig_03_inspection_missing")!;
    const dep = runDependencyEngine({ signal, tasks: seedTasks, crews: seedCrews });
    const priority = runPriorityEngine({ signal, dependencies: dep.data, activeSignals: seedSignals });
    const prediction = runPredictionEngine({ signal, priority: priority.data, dependencies: dep.data });
    expect(prediction.data.idleLaborRisk).toBe(true);
  });
});

describe("Recommendation Engine", () => {
  it("produces a primary recommendation for every Tier 1 and Tier 2 signal", () => {
    const evaluations = evaluateAllSignals(seedSignals);
    for (const evalItem of evaluations) {
      if (evalItem.priority.tier === "Tier1" || evalItem.priority.tier === "Tier2") {
        const dep = evalItem.dependencies;
        const prediction = runPredictionEngine({
          signal: evalItem.signal,
          priority: evalItem.priority,
          dependencies: dep,
        });
        const rec = runRecommendationEngine({
          signal: evalItem.signal,
          priority: evalItem.priority,
          dependencies: dep,
          prediction: prediction.data,
          tasks: seedTasks,
          crews: seedCrews,
          materials: seedMaterials,
          equipment: seedEquipment,
        });
        expect(
          rec.data,
          `Expected a recommendation for ${evalItem.signal.id} (${evalItem.priority.tier})`
        ).not.toBeNull();
      }
    }
  });

  it("does not produce a recommendation for Tier 3 or Tier 4 signals", () => {
    const signal = seedSignals.find((s) => s.id === "sig_10_rebar_received")!;
    const dep = runDependencyEngine({ signal, tasks: seedTasks, crews: seedCrews });
    const priority = runPriorityEngine({ signal, dependencies: dep.data, activeSignals: seedSignals });
    const prediction = runPredictionEngine({ signal, priority: priority.data, dependencies: dep.data });
    const rec = runRecommendationEngine({
      signal,
      priority: priority.data,
      dependencies: dep.data,
      prediction: prediction.data,
      tasks: seedTasks,
      crews: seedCrews,
      materials: seedMaterials,
      equipment: seedEquipment,
    });
    expect(rec.data).toBeNull();
  });

  it("marks the safety-related action category as requiring approval", () => {
    const signal = seedSignals.find((s) => s.type === "critical_equipment_failure")!;
    const dep = runDependencyEngine({ signal, tasks: seedTasks, crews: seedCrews });
    const priority = runPriorityEngine({ signal, dependencies: dep.data, activeSignals: seedSignals });
    const prediction = runPredictionEngine({ signal, priority: priority.data, dependencies: dep.data });
    const rec = runRecommendationEngine({
      signal,
      priority: priority.data,
      dependencies: dep.data,
      prediction: prediction.data,
      tasks: seedTasks,
      crews: seedCrews,
      materials: seedMaterials,
      equipment: seedEquipment,
    });
    expect(rec.data?.requiresApproval).toBe(true);
  });

  it("never invents an action referencing a task/crew/material not in seed data", () => {
    const evaluations = evaluateAllSignals(seedSignals);
    const validTaskNames = new Set(seedTasks.map((t) => t.name));
    const validCrewNames = new Set(seedCrews.map((c) => c.name));

    for (const evalItem of evaluations) {
      const prediction = runPredictionEngine({
        signal: evalItem.signal,
        priority: evalItem.priority,
        dependencies: evalItem.dependencies,
      });
      const rec = runRecommendationEngine({
        signal: evalItem.signal,
        priority: evalItem.priority,
        dependencies: evalItem.dependencies,
        prediction: prediction.data,
        tasks: seedTasks,
        crews: seedCrews,
        materials: seedMaterials,
        equipment: seedEquipment,
      });
      if (!rec.data) continue;
      // Soft check: if the action mentions "the assigned crew" or "the
      // affected task" fallback text, that's fine (explicit fallback for
      // missing data). Otherwise it should reference a real name.
      const mentionsFallback =
        rec.data.action.includes("the assigned crew") ||
        rec.data.action.includes("the affected task") ||
        rec.data.action.includes("the required material") ||
        rec.data.action.includes("the required equipment");
      const mentionsRealTask = [...validTaskNames].some((name) =>
        rec.data!.action.includes(name)
      );
      const mentionsRealCrew = [...validCrewNames].some((name) =>
        rec.data!.action.includes(name)
      );
      expect(mentionsFallback || mentionsRealTask || mentionsRealCrew).toBe(true);
    }
  });
});

describe("Health Engine", () => {
  it("scores below 100 when active Tier 1/2 signals exist", () => {
    const evaluations = evaluateAllSignals(seedSignals);
    const result = runHealthEngine({
      evaluations,
      updatedAt: new Date().toISOString(),
    });
    expect(result.data.overall).toBeLessThan(100);
  });

  it("never drops below 0 or exceeds 100", () => {
    const evaluations = evaluateAllSignals(seedSignals);
    const result = runHealthEngine({
      evaluations,
      updatedAt: new Date().toISOString(),
    });
    expect(result.data.overall).toBeGreaterThanOrEqual(0);
    expect(result.data.overall).toBeLessThanOrEqual(100);
  });

  it("scores higher with only resolved/archived signals than with active ones", () => {
    const allResolved = seedSignals.map((s) => ({ ...s, status: "resolved" as const }));
    const activeEvaluations = evaluateAllSignals(seedSignals);
    const resolvedEvaluations = evaluateAllSignals(allResolved);

    const activeResult = runHealthEngine({
      evaluations: activeEvaluations,
      updatedAt: new Date().toISOString(),
    });
    const resolvedResult = runHealthEngine({
      evaluations: resolvedEvaluations,
      updatedAt: new Date().toISOString(),
    });

    expect(resolvedResult.data.overall).toBeGreaterThan(activeResult.data.overall);
  });

  it("marks the inspection domain as trending down given the missing slab inspection", () => {
    const evaluations = evaluateAllSignals(seedSignals);
    const result = runHealthEngine({
      evaluations,
      updatedAt: new Date().toISOString(),
    });
    const inspectionDomain = result.data.domains.find((d) => d.domain === "inspection");
    expect(inspectionDomain?.trend).toBe("down");
  });
});

describe("Drift Engine", () => {
  it("produces a positive drift score when active Tier 1/2 signals exist", () => {
    const evaluations = evaluateAllSignals(seedSignals);
    const result = runDriftEngine({
      evaluations,
      updatedAt: new Date().toISOString(),
    });
    expect(result.data.score).toBeGreaterThan(0);
  });

  it("produces a lower drift score when all signals are resolved", () => {
    const allResolved = seedSignals.map((s) => ({ ...s, status: "resolved" as const }));
    const activeEvaluations = evaluateAllSignals(seedSignals);
    const resolvedEvaluations = evaluateAllSignals(allResolved);

    const activeResult = runDriftEngine({
      evaluations: activeEvaluations,
      updatedAt: new Date().toISOString(),
    });
    const resolvedResult = runDriftEngine({
      evaluations: resolvedEvaluations,
      updatedAt: new Date().toISOString(),
    });

    expect(resolvedResult.data.score).toBeLessThan(activeResult.data.score);
  });

  it("assigns a valid drift label", () => {
    const evaluations = evaluateAllSignals(seedSignals);
    const result = runDriftEngine({
      evaluations,
      updatedAt: new Date().toISOString(),
    });
    expect(["Normal", "Warning", "High Drift", "Critical Drift"]).toContain(
      result.data.label
    );
  });
});
