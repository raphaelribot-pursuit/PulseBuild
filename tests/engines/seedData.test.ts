import { describe, it, expect } from "vitest";
import {
  seedProject,
  seedPhases,
  seedTasks,
  seedCrews,
  seedMaterials,
  seedEquipment,
  seedInspections,
  seedPermits,
  seedWeather,
  seedSignals,
} from "@/data";

/**
 * Seed data quality rules — Technical Architecture v1.0, Section 6:
 *   - Every task must have a unique ID and dependency IDs.
 *   - At least three tasks must be on a critical path.
 *   - At least one Tier 1 and one Tier 2 scenario must demonstrate
 *     detect-react-verify.
 *   - The demo project should include one scenario that resolves and one
 *     scenario that remains unresolved after verification.
 *
 * Plus general referential integrity so later engines (Phase 3) can trust
 * this data without defensive null-checking everywhere.
 */

function collectIds<T extends { id: string }>(items: T[]): string[] {
  return items.map((i) => i.id);
}

describe("seedProject", () => {
  it("starts healthy (health score above 90)", () => {
    // SoT v2.0 Section 19: "Project starts healthy with Health Score above 90."
    expect(seedProject.healthScore).toBeGreaterThan(90);
  });

  it("is active", () => {
    expect(seedProject.status).toBe("active");
  });
});

describe("seedTasks", () => {
  it("has between 12 and 20 tasks", () => {
    expect(seedTasks.length).toBeGreaterThanOrEqual(12);
    expect(seedTasks.length).toBeLessThanOrEqual(20);
  });

  it("has all unique task IDs", () => {
    const ids = collectIds(seedTasks);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references dependency IDs that exist as real tasks", () => {
    const validIds = new Set(collectIds(seedTasks));
    for (const task of seedTasks) {
      for (const depId of task.dependencies) {
        expect(validIds.has(depId), `${task.id} depends on unknown task ${depId}`).toBe(
          true
        );
      }
    }
  });

  it("only references phases that exist", () => {
    const validPhaseIds = new Set(collectIds(seedPhases));
    for (const task of seedTasks) {
      expect(validPhaseIds.has(task.phaseId)).toBe(true);
    }
  });

  it("has no dependency cycles", () => {
    const byId = new Map(seedTasks.map((t) => [t.id, t]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function visit(id: string) {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Dependency cycle detected at ${id}`);
      }
      visiting.add(id);
      const task = byId.get(id);
      task?.dependencies.forEach(visit);
      visiting.delete(id);
      visited.add(id);
    }

    expect(() => seedTasks.forEach((t) => visit(t.id))).not.toThrow();
  });

  it("has at least three tasks on a single critical path chain", () => {
    // Walk the longest dependency chain starting from any task.
    const byId = new Map(seedTasks.map((t) => [t.id, t]));
    const memo = new Map<string, number>();

    function chainLength(id: string): number {
      if (memo.has(id)) return memo.get(id)!;
      const task = byId.get(id)!;
      const longestParent = task.dependencies.reduce(
        (max, depId) => Math.max(max, chainLength(depId)),
        0
      );
      const length = longestParent + 1;
      memo.set(id, length);
      return length;
    }

    const longest = Math.max(...seedTasks.map((t) => chainLength(t.id)));
    expect(longest).toBeGreaterThanOrEqual(3);
  });
});

describe("seedCrews", () => {
  it("has between 4 and 6 crews", () => {
    expect(seedCrews.length).toBeGreaterThanOrEqual(4);
    expect(seedCrews.length).toBeLessThanOrEqual(6);
  });

  it("has unique crew IDs", () => {
    const ids = collectIds(seedCrews);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cross-entity references from tasks", () => {
  const crewIds = new Set(collectIds(seedCrews));
  const materialIds = new Set(collectIds(seedMaterials));
  const equipmentIds = new Set(collectIds(seedEquipment));
  const inspectionIds = new Set(collectIds(seedInspections));

  it("tasks only reference crews that exist", () => {
    for (const task of seedTasks) {
      for (const id of task.requiredCrewIds) {
        expect(crewIds.has(id)).toBe(true);
      }
    }
  });

  it("tasks only reference materials that exist", () => {
    for (const task of seedTasks) {
      for (const id of task.requiredMaterialIds) {
        expect(materialIds.has(id)).toBe(true);
      }
    }
  });

  it("tasks only reference equipment that exists", () => {
    for (const task of seedTasks) {
      for (const id of task.requiredEquipmentIds) {
        expect(equipmentIds.has(id)).toBe(true);
      }
    }
  });

  it("tasks only reference inspections that exist", () => {
    for (const task of seedTasks) {
      for (const id of task.requiredInspectionIds) {
        expect(inspectionIds.has(id)).toBe(true);
      }
    }
  });
});

describe("seedPermits", () => {
  it("only references tasks that exist", () => {
    const taskIds = new Set(collectIds(seedTasks));
    for (const permit of seedPermits) {
      expect(taskIds.has(permit.requiredForTaskId)).toBe(true);
    }
  });
});

describe("seedInspections", () => {
  it("only references tasks that exist", () => {
    const taskIds = new Set(collectIds(seedTasks));
    for (const inspection of seedInspections) {
      expect(taskIds.has(inspection.requiredBeforeTaskId)).toBe(true);
    }
  });
});

describe("seedSignals", () => {
  it("has between 10 and 15 scripted signals", () => {
    expect(seedSignals.length).toBeGreaterThanOrEqual(10);
    expect(seedSignals.length).toBeLessThanOrEqual(15);
  });

  it("has unique signal IDs", () => {
    const ids = collectIds(seedSignals);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references tasks that exist when relatedTaskId is set", () => {
    const taskIds = new Set(collectIds(seedTasks));
    for (const signal of seedSignals) {
      if (signal.relatedTaskId) {
        expect(taskIds.has(signal.relatedTaskId)).toBe(true);
      }
    }
  });

  it("includes at least one Tier 1 signal", () => {
    expect(seedSignals.some((s) => s.severityHint === "Tier1")).toBe(true);
  });

  it("includes at least one Tier 2 signal", () => {
    expect(seedSignals.some((s) => s.severityHint === "Tier2")).toBe(true);
  });

  it("includes one resolved scenario (closed-loop demo path)", () => {
    // SoT v2.0 Section 19 required demo scenario.
    expect(seedSignals.some((s) => s.status === "resolved")).toBe(true);
  });

  it("includes one unresolved-after-verification scenario", () => {
    // Architecture v1.0 Section 6: "one scenario that resolves and one
    // scenario that remains unresolved after verification."
    expect(
      seedSignals.some(
        (s) =>
          s.status === "verification_pending" &&
          typeof s.rawData?.note === "string" &&
          (s.rawData.note as string).toLowerCase().includes("unresolved")
      )
    ).toBe(true);
  });

  it("the Tier 1 inspection-missing and Tier 2 material-delay signals share the same blocked task (combined priority scenario)", () => {
    // SoT v2.0 Section 9 priority rule: signals combine to escalate
    // attention on a single task (slab pour).
    const inspectionMissing = seedSignals.find(
      (s) => s.type === "inspection_missing"
    );
    const materialDelay = seedSignals.find(
      (s) => s.type === "material_delivery_delayed"
    );
    expect(inspectionMissing?.relatedTaskId).toBe("task_slab_pour");
    expect(materialDelay?.relatedTaskId).toBe("task_slab_pour");
  });
});

describe("seedWeather", () => {
  it("has unique weather event IDs", () => {
    const ids = collectIds(seedWeather);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
