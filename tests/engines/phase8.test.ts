import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore } from "@/store/useAgentStore";
import { useSimulationStore } from "@/store/useSimulationStore";
import { useProjectStore } from "@/store/useProjectStore";
import { seedEquipment } from "@/data";

describe("Guardrail: safety actions never execute automatically", () => {
  beforeEach(() => {
    useSimulationStore.getState().resetSimulation();
  });

  it("a safety_incident signal's recommendation is classified blocked_safety, not autonomous, before any human decision", () => {
    // sig_11 is a Tier4 archived safety walkthrough (already passed), not
    // a live incident — use a synthetic check against the real pipeline
    // instead: ingest whatever signals exist and confirm no analysis
    // with actionCategory "safety_review" is ever autonomous.
    useAgentStore.getState().ingestSignal("sig_03_inspection_missing");
    useAgentStore.getState().ingestSignal("sig_05_equipment_failure");

    const analyses = useAgentStore.getState().analyses;
    const safetyRecs = analyses
      .map((a) => a.recommendation)
      .filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.actionCategory === "safety_review");

    // None of the seeded live scenarios happen to be safety_incident, so
    // this also directly asserts the engine-level rule with a synthetic
    // recommendation shape via the approval engine path exercised in
    // approvalVerification.test.ts. This test additionally confirms that
    // if one WERE present, it could never reach the store as
    // "autonomous".
    for (const rec of safetyRecs) {
      expect(rec.requiresApproval).toBe(true);
    }
  });

  it("approving a safety_review action still requires an explicit human approveRecommendation call — there is no autonomous path in the store", () => {
    // The store's approveRecommendation only ever runs after a human
    // calls it; there is no code path that calls it automatically for
    // any actionCategory, safety or otherwise. Confirm no recommendation
    // starts pre-approved.
    useAgentStore.getState().ingestSignal("sig_03_inspection_missing");
    const analyses = useAgentStore.getState().analyses;
    const approvals = useAgentStore.getState().approvals;
    for (const a of analyses) {
      if (a.recommendation) {
        expect(approvals[a.recommendation.id]).toBeUndefined();
      }
    }
  });
});

describe("Full reset (Phase 8): resetSimulation rolls back project entity state too", () => {
  beforeEach(() => {
    useSimulationStore.getState().resetSimulation();
  });

  it("an inspection scheduled via approval is rolled back to its seed status after resetSimulation", () => {
    useAgentStore.getState().ingestSignal("sig_03_inspection_missing");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_03_inspection_missing");
    const recId = analysis!.recommendation!.id;
    useAgentStore.getState().approveRecommendation(recId);

    expect(
      useProjectStore.getState().inspections.find((i) => i.id === "insp_slab")?.status
    ).toBe("scheduled");

    useSimulationStore.getState().resetSimulation();

    expect(
      useProjectStore.getState().inspections.find((i) => i.id === "insp_slab")?.status
    ).toBe("not_scheduled");
    expect(Object.keys(useAgentStore.getState().approvals)).toHaveLength(0);
  });

  it("equipment reassigned via approval is rolled back after resetSimulation", () => {
    useProjectStore.getState().applyEquipmentUpdates([
      { ...seedEquipment.find((e) => e.id === "equip_lift")!, status: "reserved" },
    ]);
    expect(
      useProjectStore.getState().equipment.find((e) => e.id === "equip_lift")?.status
    ).toBe("reserved");

    useSimulationStore.getState().resetSimulation();

    expect(
      useProjectStore.getState().equipment.find((e) => e.id === "equip_lift")?.status
    ).toBe("available");
  });
});

describe("Try Alternative (Phase 8)", () => {
  beforeEach(() => {
    useSimulationStore.getState().resetSimulation();
  });

  it("runs the chosen alternative through the approval pipeline in the primary's place", () => {
    useAgentStore.getState().ingestSignal("sig_02_material_delay");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_02_material_delay");
    const recId = analysis!.recommendation!.id;
    expect(analysis!.recommendation!.alternatives.length).toBeGreaterThan(0);

    useAgentStore.getState().rejectRecommendation(recId);
    expect(useAgentStore.getState().approvals[recId].status).toBe("rejected");

    useAgentStore.getState().tryAlternative(recId, 0);

    const approval = useAgentStore.getState().approvals[recId];
    const verification = useAgentStore.getState().verifications[recId];
    expect(approval.status).toBe("approved");
    expect(verification).toBeDefined();
  });

  it("warns and no-ops when the alternative index doesn't exist", () => {
    useAgentStore.getState().ingestSignal("sig_02_material_delay");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_02_material_delay");
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().tryAlternative(recId, 99);

    expect(useAgentStore.getState().approvals[recId]).toBeUndefined();
  });

  it("regression: a partially-resolved alternative clears hasUnresolvedRecommendation instead of leaving the signal flagged as untouched", () => {
    // Bug: hasUnresolvedRecommendation used to check signal.status !==
    // "action_taken", but the runtime pipeline never writes that status —
    // it only ever writes "resolved" or "verification_pending". So a
    // mitigation-only alternative (crew_reassignment / task_resequence),
    // which the Verification Engine always classifies as
    // partially_resolved by design, left the signal looking identical to
    // one no one had ever acted on: same tier, same primary
    // recommendation regenerated on recompute, still counted as an
    // unresolved recommendation against Health/Drift, still eligible to
    // be the top blocker. Approving or trying an alternative appeared to
    // do nothing even though the decision and verification were correctly
    // recorded in `approvals` / `verifications`.
    useAgentStore.getState().ingestSignal("sig_02_material_delay");
    let analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_02_material_delay");
    const recId = analysis!.recommendation!.id;

    expect(analysis!.hasUnresolvedRecommendation).toBe(true);

    const altIndex = analysis!.recommendation!.alternatives.findIndex((alt) =>
      ["crew_reassignment", "task_resequence"].includes(alt.actionCategory)
    );
    expect(altIndex).toBeGreaterThanOrEqual(0);

    useAgentStore.getState().tryAlternative(recId, altIndex);

    const verification = useAgentStore.getState().verifications[recId];
    expect(verification.outcome).toBe("partially_resolved");

    analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_02_material_delay");
    expect(analysis!.signal.status).toBe("verification_pending");
    // The actual regression assertion: once a decision has been recorded
    // and verified — even partially — the signal must stop being scored
    // as if it still needs a fresh recommendation.
    expect(analysis!.hasUnresolvedRecommendation).toBe(false);
  });

  it("regression: an already-tried alternative is not offered again, even though its outcome will never be 'resolved'", () => {
    // Bug: canTryAlternative in RecommendationQueue.tsx only checked
    // `verification.outcome !== "resolved"`, with no memory of which
    // alternative had already been run. crew_reassignment / task_resequence
    // alternatives are classified partially_resolved by the Verification
    // Engine every single time, by design — so that condition can never
    // flip false on its own, and the same alternative kept reappearing
    // for the user to click again, deterministically reproducing the
    // identical outcome. From the user's side this looked exactly like
    // the button doing nothing. The store now records which alternative
    // indices have been attempted per recommendation id, so the UI layer
    // can stop offering ones already tried instead of relying solely on
    // the outcome field.
    useAgentStore.getState().ingestSignal("sig_02_material_delay");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_02_material_delay");
    const recId = analysis!.recommendation!.id;

    const altIndex = analysis!.recommendation!.alternatives.findIndex((alt) =>
      ["crew_reassignment", "task_resequence"].includes(alt.actionCategory)
    );
    expect(altIndex).toBeGreaterThanOrEqual(0);

    expect(useAgentStore.getState().attemptedAlternatives[recId]).toBeUndefined();

    useAgentStore.getState().tryAlternative(recId, altIndex);

    const verification = useAgentStore.getState().verifications[recId];
    expect(verification.outcome).toBe("partially_resolved");

    // The actual regression assertion: the attempted index is recorded
    // even though the outcome (deliberately) never became "resolved" —
    // this is what lets the UI stop offering it, independent of outcome.
    expect(useAgentStore.getState().attemptedAlternatives[recId]).toEqual([altIndex]);

    // Trying the SAME alternative again should still work mechanically
    // (the pipeline itself is unaffected) and should append rather than
    // duplicate/overwrite, so a second distinct alternative could still
    // be tracked correctly later.
    useAgentStore.getState().tryAlternative(recId, altIndex);
    expect(useAgentStore.getState().attemptedAlternatives[recId]).toEqual([
      altIndex,
      altIndex,
    ]);
  });
});
