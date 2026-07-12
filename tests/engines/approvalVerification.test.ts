import { describe, it, expect, beforeEach } from "vitest";
import { runApprovalEngine, decideApproval } from "@/engines/approvalEngine";
import { runVerificationEngine } from "@/engines/verificationEngine";
import { runExecutionSimulation } from "@/lib/executionSimulation";
import { seedEquipment, seedCrews, seedInspections } from "@/data";
import { Recommendation } from "@/domain/types";
import { useAgentStore } from "@/store/useAgentStore";
import { useProjectStore } from "@/store/useProjectStore";

function baseRecommendation(overrides: Partial<Recommendation>): Recommendation {
  return {
    id: "rec_test",
    signalId: "sig_test",
    intent: "restore_productivity",
    actionCategory: "notification_only",
    action: "Do the thing.",
    rationale: "Because reasons.",
    expectedBenefit: "Things improve.",
    tradeoffs: [],
    confidence: 0.8,
    requiresApproval: false,
    verificationPlan: { checks: [], expectedSignal: "" },
    alternatives: [],
    ...overrides,
  };
}

describe("Approval Engine", () => {
  it("classifies crew_reassignment as approval_required (not autonomous)", () => {
    const rec = baseRecommendation({ actionCategory: "crew_reassignment" });
    const result = runApprovalEngine({ recommendation: rec });
    expect(result.data.status).toBe("approval_required");
  });

  it("classifies safety_review as blocked_safety even though it also requires approval", () => {
    const rec = baseRecommendation({ actionCategory: "safety_review" });
    const result = runApprovalEngine({ recommendation: rec });
    expect(result.data.status).toBe("blocked_safety");
  });

  it("classifies notification_only as autonomous", () => {
    const rec = baseRecommendation({ actionCategory: "notification_only" });
    const result = runApprovalEngine({ recommendation: rec });
    expect(result.data.status).toBe("autonomous");
  });

  it("decideApproval moves approval_required -> approved with decidedBy/decidedAt stamped", () => {
    const rec = baseRecommendation({ actionCategory: "crew_reassignment" });
    const starting = runApprovalEngine({ recommendation: rec }).data;
    const decided = decideApproval({
      current: starting,
      decision: "approve",
      decidedBy: "user",
      decidedAt: "2026-07-08T10:00:00.000Z",
    });
    expect(decided.ok).toBe(true);
    expect(decided.data.status).toBe("approved");
    expect(decided.data.decidedBy).toBe("user");
  });

  it("refuses to re-decide an already-finalized approval", () => {
    const approved = {
      status: "approved" as const,
      reason: "Approved by user.",
      decidedAt: "2026-07-08T10:00:00.000Z",
      decidedBy: "user",
    };
    const result = decideApproval({
      current: approved,
      decision: "reject",
      decidedBy: "user",
      decidedAt: "2026-07-08T11:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    expect(result.data.status).toBe("approved"); // unchanged
  });
});

describe("Execution Simulation", () => {
  it("finds no qualified backup for the down tower crane (other idle equipment isn't rated for that task)", () => {
    const effect = runExecutionSimulation({
      actionCategory: "equipment_reassignment",
      relatedTaskId: "task_steel_erection",
      relatedEntityId: "equip_crane",
      crews: seedCrews,
      equipment: seedEquipment,
      inspections: seedInspections,
    });
    // equip_lift and equip_excavator are "available" but neither lists
    // task_steel_erection in requiredForTaskIds, so there is no genuine
    // substitute — this must come back infeasible.
    expect(effect.feasible).toBe(false);
  });

  it("schedules a not-yet-scheduled inspection successfully", () => {
    const effect = runExecutionSimulation({
      actionCategory: "inspection_reschedule",
      relatedTaskId: "task_slab_pour",
      relatedEntityId: "insp_slab",
      crews: seedCrews,
      equipment: seedEquipment,
      inspections: seedInspections,
    });
    expect(effect.feasible).toBe(true);
    expect(effect.updatedInspections?.[0].status).toBe("scheduled");
  });

  it("crew_reassignment is always feasible but only mitigates, never fixes root cause", () => {
    const effect = runExecutionSimulation({
      actionCategory: "crew_reassignment",
      relatedTaskId: "task_slab_pour",
      relatedEntityId: "mat_concrete",
      crews: seedCrews,
      equipment: seedEquipment,
      inspections: seedInspections,
    });
    expect(effect.feasible).toBe(true);
  });

  it("permit_change is never feasible from inside the system", () => {
    const effect = runExecutionSimulation({
      actionCategory: "permit_change",
      relatedTaskId: "task_occupancy",
      relatedEntityId: "permit_occupancy",
      crews: seedCrews,
      equipment: seedEquipment,
      inspections: seedInspections,
    });
    expect(effect.feasible).toBe(false);
  });
});

describe("Verification Engine", () => {
  it("classifies a feasible root-cause-fixing action as resolved", () => {
    const rec = baseRecommendation({ actionCategory: "inspection_reschedule" });
    const result = runVerificationEngine({
      recommendation: rec,
      effect: { feasible: true, note: "Inspection scheduled." },
      checkedAt: "2026-07-08T10:00:00.000Z",
    });
    expect(result.data.outcome).toBe("resolved");
  });

  it("classifies an infeasible root-cause-fixing action as unresolved with a next-best action", () => {
    const rec = baseRecommendation({
      actionCategory: "equipment_reassignment",
      alternatives: [{ action: "Resequence around the outage.", rationale: "x", score: 50, actionCategory: "task_resequence" }],
    });
    const result = runVerificationEngine({
      recommendation: rec,
      effect: { feasible: false, note: "No backup available." },
      checkedAt: "2026-07-08T10:00:00.000Z",
    });
    expect(result.data.outcome).toBe("unresolved");
    expect(result.data.nextBestAction).toBe("Resequence around the outage.");
  });

  it("classifies mitigation-only categories as partially_resolved even when feasible", () => {
    const rec = baseRecommendation({ actionCategory: "crew_reassignment" });
    const result = runVerificationEngine({
      recommendation: rec,
      effect: { feasible: true, note: "Crew reassigned." },
      checkedAt: "2026-07-08T10:00:00.000Z",
    });
    expect(result.data.outcome).toBe("partially_resolved");
  });

  it("classifies permit_change as always unresolved", () => {
    const rec = baseRecommendation({ actionCategory: "permit_change" });
    const result = runVerificationEngine({
      recommendation: rec,
      effect: { feasible: false, note: "Expedite request sent." },
      checkedAt: "2026-07-08T10:00:00.000Z",
    });
    expect(result.data.outcome).toBe("unresolved");
  });
});

describe("useAgentStore approve/reject integration", () => {
  beforeEach(() => {
    useAgentStore.getState().resetAgentState();
  });

  it("reproduces the seeded resolved-path scenario: weather alert + crew reassignment -> partially_resolved (mitigates, doesn't stop the rain)", () => {
    useAgentStore.getState().ingestSignal("sig_01_weather_rain");
    // sig_01 is seeded already "resolved" so it won't have a live
    // recommendation to approve — use sig_07 (task_behind_schedule,
    // task_resequence category) as a live stand-in for the same
    // mitigation-only category class.
    useAgentStore.getState().ingestSignal("sig_07_task_behind");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_07_task_behind");
    expect(analysis?.recommendation).not.toBeNull();
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().approveRecommendation(recId);

    const verification = useAgentStore.getState().verifications[recId];
    expect(verification.outcome).toBe("partially_resolved");
  });

  it("reproduces the seeded unresolved-path scenario: crane failure has no qualified backup", () => {
    useAgentStore.getState().ingestSignal("sig_05_equipment_failure");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_05_equipment_failure");
    expect(analysis?.recommendation).not.toBeNull();
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().approveRecommendation(recId);

    const verification = useAgentStore.getState().verifications[recId];
    expect(verification.outcome).toBe("unresolved");
    const signal = useAgentStore
      .getState()
      .analyses.find((a) => a.recommendation?.id === recId)?.signal;
    expect(signal?.status).toBe("verification_pending");
  });

  it("reproduces a resolved-path scenario: inspection scheduling succeeds and closes the signal", () => {
    useAgentStore.getState().ingestSignal("sig_03_inspection_missing");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_03_inspection_missing");
    expect(analysis?.recommendation).not.toBeNull();
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().approveRecommendation(recId);

    const verification = useAgentStore.getState().verifications[recId];
    expect(verification.outcome).toBe("resolved");
    const signal = useAgentStore
      .getState()
      .analyses.find((a) => a.recommendation?.id === recId)?.signal;
    expect(signal?.status).toBe("resolved");
  });

  it("rejecting a recommendation logs the decision and leaves the signal active", () => {
    useAgentStore.getState().ingestSignal("sig_02_material_delay");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_02_material_delay");
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().rejectRecommendation(recId);

    expect(useAgentStore.getState().approvals[recId].status).toBe("rejected");
    const signal = useAgentStore
      .getState()
      .analyses.find((a) => a.recommendation?.id === recId)?.signal;
    expect(signal?.status).not.toBe("resolved");
  });

  it("is idempotent: approving twice does not re-decide or throw", () => {
    useAgentStore.getState().ingestSignal("sig_03_inspection_missing");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_03_inspection_missing");
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().approveRecommendation(recId);
    const firstDecidedAt = useAgentStore.getState().approvals[recId].decidedAt;
    useAgentStore.getState().approveRecommendation(recId);
    const secondDecidedAt = useAgentStore.getState().approvals[recId].decidedAt;

    expect(secondDecidedAt).toBe(firstDecidedAt);
  });

  it("resetAgentState clears approvals/verifications along with signals", () => {
    useAgentStore.getState().ingestSignal("sig_03_inspection_missing");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_03_inspection_missing");
    const recId = analysis!.recommendation!.id;
    useAgentStore.getState().approveRecommendation(recId);

    useAgentStore.getState().resetAgentState();

    expect(Object.keys(useAgentStore.getState().approvals)).toHaveLength(0);
    expect(Object.keys(useAgentStore.getState().verifications)).toHaveLength(0);
    expect(useProjectStore.getState().inspections.find((i) => i.id === "insp_slab")?.status).toBe(
      "scheduled" // note: project store entity mutations are NOT reset by resetAgentState;
      // this documents that known limitation rather than hiding it.
    );
  });
});
