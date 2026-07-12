import { describe, it, expect } from "vitest";
import {
  seedProject,
  seedTasks,
  seedCrews,
  seedMaterials,
  seedEquipment,
  seedSignals,
} from "@/data";
import { runAgentOrchestrator } from "@/agent/agentOrchestrator";
import { DEMO_CURRENT_DATE } from "@/domain/constants/demo";

function runDemo() {
  return runAgentOrchestrator({
    projectId: seedProject.id,
    signals: seedSignals,
    tasks: seedTasks,
    crews: seedCrews,
    materials: seedMaterials,
    equipment: seedEquipment,
    asOf: DEMO_CURRENT_DATE,
  });
}

describe("Agent Orchestrator", () => {
  it("produces one analysis per signal", () => {
    const result = runDemo();
    expect(result.analyses.length).toBe(seedSignals.length);
  });

  it("produces a non-null recommendation for every active Tier 1/2 analysis", () => {
    const result = runDemo();
    for (const analysis of result.analyses) {
      if (
        (analysis.priority.tier === "Tier1" || analysis.priority.tier === "Tier2")
      ) {
        expect(analysis.recommendation).not.toBeNull();
      }
    }
  });

  it("selects the highest attention-score active signal as the top blocker", () => {
    const result = runDemo();
    expect(result.topBlocker).not.toBeNull();
    const activeAnalyses = result.analyses.filter(
      (a) => a.signal.status !== "resolved" && a.signal.status !== "archived"
    );
    const maxAttention = Math.max(
      ...activeAnalyses.map((a) => a.priority.attentionScore)
    );
    expect(result.topBlocker!.priority.attentionScore).toBe(maxAttention);
  });

  it("never selects a resolved or archived signal as the top blocker", () => {
    const result = runDemo();
    expect(result.topBlocker!.signal.status).not.toBe("resolved");
    expect(result.topBlocker!.signal.status).not.toBe("archived");
  });

  it("produces a health score below 100 given active demo signals", () => {
    const result = runDemo();
    expect(result.health.overall).toBeLessThan(100);
    expect(result.health.overall).toBeGreaterThanOrEqual(0);
  });

  it("produces a positive drift score given active demo signals", () => {
    const result = runDemo();
    expect(result.drift.score).toBeGreaterThan(0);
  });

  it("produces a non-empty timeline grouped by signal in signal-creation order", () => {
    // Events are grouped by signal (all of one signal's story stays
    // together) rather than flattened into a single global timestamp
    // sort — this reads better as an audit trail than interleaving
    // unrelated signals' events by timestamp.
    const result = runDemo();
    expect(result.timeline.length).toBeGreaterThan(0);

    const signalOrderInTimeline: string[] = [];
    for (const event of result.timeline) {
      if (
        event.relatedSignalId &&
        signalOrderInTimeline[signalOrderInTimeline.length - 1] !== event.relatedSignalId
      ) {
        signalOrderInTimeline.push(event.relatedSignalId);
      }
    }

    const expectedSignalOrder = [...seedSignals]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((s) => s.id);

    expect(signalOrderInTimeline).toEqual(expectedSignalOrder);
  });

  it("emits an approval.required event for every recommendation that requires approval", () => {
    const result = runDemo();
    const approvalRequiredCount = result.timeline.filter(
      (e) => e.type === "approval.required"
    ).length;
    const recommendationsRequiringApproval = result.analyses.filter(
      (a) => a.recommendation?.requiresApproval
    ).length;
    expect(approvalRequiredCount).toBe(recommendationsRequiringApproval);
  });

  it("is a pure function — running twice with the same input yields the same health score", () => {
    const first = runDemo();
    const second = runDemo();
    expect(first.health.overall).toBe(second.health.overall);
    expect(first.drift.score).toBe(second.drift.score);
  });
});
