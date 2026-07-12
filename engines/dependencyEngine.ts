import {
  Task,
  Crew,
  ProjectSignal,
  DependencyOutput,
  EngineResult,
  EvidenceItem,
} from "@/domain/types";

/**
 * Dependency Engine
 * Source: Technical Architecture v1.0, Section 7 (Reactive Engine
 * Services) + Cognitive & Reasoning Spec, Section 7 (Dependency
 * Intelligence).
 *
 * Pure function. Given a signal (already tied to a task via
 * relatedTaskId) and the full task/crew universe, walks the dependency
 * graph downstream to find every task that becomes affected, and reports
 * cascade depth plus whether the critical path is touched.
 *
 * "Critical path" here is defined as the longest dependency chain in the
 * task graph (see findCriticalPath) — this matches the seed-data
 * invariant enforced in tests/engines/seedData.test.ts.
 */

export interface DependencyEngineInput {
  signal: ProjectSignal;
  tasks: Task[];
  crews: Crew[];
}

/** Returns the ordered list of task IDs on the single longest dependency
 * chain in the graph. Assumes no cycles (enforced by seed data tests). */
export function findCriticalPath(tasks: Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, string[]>();

  function longestChainEndingAt(id: string): string[] {
    if (memo.has(id)) return memo.get(id)!;
    const task = byId.get(id);
    if (!task) return [];
    let best: string[] = [];
    for (const depId of task.dependencies) {
      const chain = longestChainEndingAt(depId);
      if (chain.length > best.length) best = chain;
    }
    const result = [...best, id];
    memo.set(id, result);
    return result;
  }

  let longest: string[] = [];
  for (const task of tasks) {
    const chain = longestChainEndingAt(task.id);
    if (chain.length > longest.length) longest = chain;
  }
  return longest;
}

/** Every task that directly or indirectly depends on `taskId`. */
export function findDownstreamTasks(taskId: string, tasks: Task[]): string[] {
  const downstreamOf = new Map<string, string[]>();
  for (const task of tasks) {
    for (const depId of task.dependencies) {
      const list = downstreamOf.get(depId) ?? [];
      list.push(task.id);
      downstreamOf.set(depId, list);
    }
  }

  const affected: string[] = [];
  const queue = [...(downstreamOf.get(taskId) ?? [])];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    affected.push(id);
    const next = downstreamOf.get(id) ?? [];
    queue.push(...next);
  }

  return affected;
}

/** Cascade depth = number of dependency hops from taskId to the farthest
 * downstream task. 0 if nothing depends on it. */
export function cascadeDepthFrom(taskId: string, tasks: Task[]): number {
  const downstreamOf = new Map<string, string[]>();
  for (const task of tasks) {
    for (const depId of task.dependencies) {
      const list = downstreamOf.get(depId) ?? [];
      list.push(task.id);
      downstreamOf.set(depId, list);
    }
  }

  let maxDepth = 0;
  const queue: Array<{ id: string; depth: number }> = (
    downstreamOf.get(taskId) ?? []
  ).map((id) => ({ id, depth: 1 }));
  const seen = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const next = downstreamOf.get(id) ?? [];
    queue.push(...next.map((n) => ({ id: n, depth: depth + 1 })));
  }

  return maxDepth;
}

export function runDependencyEngine(
  input: DependencyEngineInput
): EngineResult<DependencyOutput> {
  const { signal, tasks, crews } = input;
  const warnings: string[] = [];
  const evidence: EvidenceItem[] = [];

  const anchorTaskId = signal.relatedTaskId;

  if (!anchorTaskId) {
    warnings.push(
      "Signal has no relatedTaskId; dependency analysis skipped."
    );
    return {
      ok: false,
      data: {
        affectedTaskIds: [],
        affectedCrewIds: [],
        affectedMilestoneIds: [],
        cascadeDepth: 0,
        criticalPathImpact: false,
      },
      warnings,
      confidence: 0.3,
      evidence,
    };
  }

  const anchorTask = tasks.find((t) => t.id === anchorTaskId);
  if (!anchorTask) {
    warnings.push(`relatedTaskId ${anchorTaskId} not found in task list.`);
    return {
      ok: false,
      data: {
        affectedTaskIds: [],
        affectedCrewIds: [],
        affectedMilestoneIds: [],
        cascadeDepth: 0,
        criticalPathImpact: false,
      },
      warnings,
      confidence: 0.3,
      evidence,
    };
  }

  const downstreamTaskIds = findDownstreamTasks(anchorTaskId, tasks);
  const affectedTaskIds = [anchorTaskId, ...downstreamTaskIds];
  const cascadeDepth = cascadeDepthFrom(anchorTaskId, tasks);

  evidence.push({
    label: "Downstream tasks",
    detail: `${downstreamTaskIds.length} task(s) depend on ${anchorTask.name} directly or indirectly.`,
    sourceEntityId: anchorTaskId,
  });

  // Affected crews: any crew required by an affected task.
  const affectedTasks = tasks.filter((t) => affectedTaskIds.includes(t.id));
  const affectedCrewIdSet = new Set<string>();
  for (const task of affectedTasks) {
    task.requiredCrewIds.forEach((id) => affectedCrewIdSet.add(id));
  }
  const affectedCrewIds = Array.from(affectedCrewIdSet).filter((id) =>
    crews.some((c) => c.id === id)
  );

  if (affectedCrewIds.length > 0) {
    evidence.push({
      label: "Affected crews",
      detail: `${affectedCrewIds.length} crew(s) assigned to affected tasks.`,
    });
  }

  // No dedicated milestone entity exists in the seed schema; the closest
  // proxy is the set of distinct phases touched by affected tasks.
  const affectedMilestoneIds = Array.from(
    new Set(affectedTasks.map((t) => t.phaseId))
  );

  const criticalPath = findCriticalPath(tasks);
  const criticalPathImpact = affectedTaskIds.some((id) =>
    criticalPath.includes(id)
  );

  if (criticalPathImpact) {
    evidence.push({
      label: "Critical path impact",
      detail: `${anchorTask.name} sits on the project's critical path.`,
      sourceEntityId: anchorTaskId,
    });
  }

  return {
    ok: true,
    data: {
      affectedTaskIds,
      affectedCrewIds,
      affectedMilestoneIds,
      cascadeDepth,
      criticalPathImpact,
    },
    warnings,
    confidence: 0.95,
    evidence,
  };
}
