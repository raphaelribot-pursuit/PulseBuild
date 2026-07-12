import { describe, it, expect, beforeEach } from "vitest";
import { buildAgentResponse, explanationToText, buildNoBlockerSummary } from "@/lib/agentExplanationBuilder";
import { shouldSpeak, buildVoiceText, hasSpoken, markSpoken, resetSpokenSignals } from "@/lib/voiceAdapter";
import { runAgentOrchestrator } from "@/agent/agentOrchestrator";
import { seedProject, seedTasks, seedCrews, seedMaterials, seedEquipment, seedSignals } from "@/data";
import { DEMO_CURRENT_DATE } from "@/domain/constants/demo";

function analysesFor(signalIds: string[]) {
  const byId = new Map(seedSignals.map((s) => [s.id, s]));
  const signals = signalIds.map((id) => byId.get(id)!);
  return runAgentOrchestrator({
    projectId: seedProject.id,
    signals,
    tasks: seedTasks,
    crews: seedCrews,
    materials: seedMaterials,
    equipment: seedEquipment,
    asOf: DEMO_CURRENT_DATE,
  }).analyses;
}

describe("Agent Explanation Builder", () => {
  it("builds a full explanation for a Tier 1 signal with a recommendation, grounded in real fields only", () => {
    const [analysis] = analysesFor(["sig_03_inspection_missing"]);
    const explanation = buildAgentResponse(analysis);

    expect(explanation.situation).toContain("Inspection Missing");
    expect(explanation.priority).toContain("Tier 1");
    expect(explanation.recommendation).toBe(analysis.recommendation!.action);
    expect(explanation.approval).toContain("Requires approval");
  });

  it("says 'not applicable' for approval/verification when there's no recommendation", () => {
    // sig_09 (rebar received) is a Tier4 archived-lifecycle signal — no
    // recommendation is generated at that tier.
    const [analysis] = analysesFor(["sig_10_rebar_received"]);
    const explanation = buildAgentResponse(analysis);
    expect(analysis.recommendation).toBeNull();
    expect(explanation.approval).toBe("Not applicable.");
    expect(explanation.verification).toBe("Not applicable.");
  });

  it("reflects a decided approval in the explanation text", () => {
    const [analysis] = analysesFor(["sig_03_inspection_missing"]);
    const explanation = buildAgentResponse(analysis, {
      status: "approved",
      reason: "Approved by user.",
      decidedBy: "user",
      decidedAt: DEMO_CURRENT_DATE,
    });
    expect(explanation.approval).toContain("Approved by user");
  });

  it("reflects a verification result in the explanation text", () => {
    const [analysis] = analysesFor(["sig_05_equipment_failure"]);
    const explanation = buildAgentResponse(analysis, undefined, {
      outcome: "unresolved",
      checkedAt: DEMO_CURRENT_DATE,
      resultSummary: "No backup available.",
      nextBestAction: "Resequence around the outage.",
    });
    expect(explanation.verification).toContain("Unresolved");
    expect(explanation.verification).toContain("Resequence around the outage.");
  });

  it("explanationToText produces all seven labeled fields", () => {
    const [analysis] = analysesFor(["sig_02_material_delay"]);
    const text = explanationToText(buildAgentResponse(analysis));
    for (const label of ["Situation:", "Priority:", "Evidence:", "Impact:", "Recommendation:", "Approval:", "Verification:"]) {
      expect(text).toContain(label);
    }
  });

  it("buildNoBlockerSummary reports health and drift plainly", () => {
    const summary = buildNoBlockerSummary(
      { overall: 94, domains: [], updatedAt: DEMO_CURRENT_DATE },
      { score: 5, label: "Normal", causes: [], updatedAt: DEMO_CURRENT_DATE }
    );
    expect(summary).toContain("94/100");
    expect(summary).toContain("Normal");
  });
});

describe("Voice Adapter", () => {
  beforeEach(() => resetSpokenSignals());

  it("always speaks Tier 1 unless muted", () => {
    const [analysis] = analysesFor(["sig_03_inspection_missing"]);
    expect(shouldSpeak({ analysis, muted: false })).toBe(true);
    expect(shouldSpeak({ analysis, muted: true })).toBe(false);
  });

  it("speaks Tier 2 only when on the critical path or explicitly enabled", () => {
    // sig_06 (permit_pending) is genuinely Tier2 in isolation and does
    // NOT hit critical-path escalation (cascade depth 0), so it's a
    // clean Tier2-not-on-critical-path fixture.
    const [analysis] = analysesFor(["sig_06_permit_pending"]);
    expect(analysis.priority.tier).toBe("Tier2");
    expect(analysis.dependencies.criticalPathImpact).toBe(true);
    // This one *is* flagged criticalPathImpact (task_occupancy sits on
    // the critical path even with no downstream cascade), so it should
    // speak without needing the opt-in flag.
    expect(shouldSpeak({ analysis, muted: false })).toBe(true);
  });

  it("does not speak a Tier 2 signal off the critical path unless explicitly enabled", () => {
    const [analysis] = analysesFor(["sig_07_task_behind"]);
    expect(analysis.priority.tier).toBe("Tier2");
    expect(analysis.dependencies.criticalPathImpact).toBe(false);
    expect(shouldSpeak({ analysis, muted: false })).toBe(false);
    expect(shouldSpeak({ analysis, muted: false, tier2VoiceEnabled: true })).toBe(true);
  });

  it("never speaks Tier 3 or Tier 4 by default", () => {
    const [analysis] = analysesFor(["sig_08_minor_delay"]); // genuinely Tier3
    expect(analysis.priority.tier).toBe("Tier3");
    expect(shouldSpeak({ analysis, muted: false, tier2VoiceEnabled: true })).toBe(false);
  });

  it("buildVoiceText includes issue and recommended action, and stays short", () => {
    const [analysis] = analysesFor(["sig_03_inspection_missing"]);
    const text = buildVoiceText(analysis);
    expect(text).toContain("Inspection Missing");
    expect(text).toContain("Recommended action");
    // Rough proxy for "under 20 seconds of speech" — well under 60 words.
    expect(text.split(/\s+/).length).toBeLessThan(60);
  });

  it("tracks spoken signals so the same signal isn't spoken twice", () => {
    expect(hasSpoken("sig_03_inspection_missing")).toBe(false);
    markSpoken("sig_03_inspection_missing");
    expect(hasSpoken("sig_03_inspection_missing")).toBe(true);
    resetSpokenSignals();
    expect(hasSpoken("sig_03_inspection_missing")).toBe(false);
  });
});
