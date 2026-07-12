import { describe, it, expect, beforeEach } from "vitest";
import { buildAgentResponse, explanationToText, buildNoBlockerSummary } from "@/lib/agentExplanationBuilder";
import { shouldSpeak, buildVoiceText, hasSpoken, markSpoken, resetSpokenSignals, estimateSpeechDurationMs, scoreVoiceQuality, pickBestVoice, VoiceCandidate } from "@/lib/voiceAdapter";
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

describe("Speech Duration Estimator (simulation pacing)", () => {
  // Added alongside the fix for voice alerts audibly drifting behind
  // the event they describe: useSimulationStore now paces the next
  // scripted event around how long the current one takes to speak,
  // using this pure estimator. Covers the exact class of bug (browser
  // TTS timing) the Phase 7 handoff flagged as untested.

  it("scales roughly linearly with word count", () => {
    const short = estimateSpeechDurationMs("Critical alert: crane down.");
    const long = estimateSpeechDurationMs(
      "Critical alert: critical equipment failure on task steel erection. This is on the critical path. Recommended action: equipment reassignment."
    );
    expect(long).toBeGreaterThan(short);
  });

  it("always includes a non-zero buffer, even for empty text", () => {
    expect(estimateSpeechDurationMs("")).toBeGreaterThan(0);
  });

  it("estimates a real seed signal's voice text in a plausible 5-20s speaking range", () => {
    const [analysis] = analysesFor(["sig_03_inspection_missing"]);
    const text = buildVoiceText(analysis);
    const ms = estimateSpeechDurationMs(text);
    // Sanity bounds per Architecture Section 14: voice text must stay
    // under ~20 seconds. Floor of 3s guards against a degenerate
    // near-zero estimate for very short text.
    expect(ms).toBeGreaterThan(3000);
    expect(ms).toBeLessThan(20000);
  });

  it("is deterministic — same text always yields the same estimate", () => {
    const text = "Alert: material delivery delayed on task slab pour. This is on the critical path.";
    expect(estimateSpeechDurationMs(text)).toBe(estimateSpeechDurationMs(text));
  });
});

describe("Voice Quality Selection", () => {
  // Added for the fix where the OS default voice (typically the
  // lowest-quality "compact" tier) was being used instead of any
  // higher-quality voice actually installed (macOS Enhanced/Premium,
  // Windows "Online (Natural)", etc).

  function v(name: string, lang = "en-US"): VoiceCandidate {
    return { voiceURI: name, name, lang };
  }

  it("scores Enhanced/Premium/Natural/Neural voices above a plain compact voice", () => {
    const compact = scoreVoiceQuality(v("Samantha (Compact)"));
    const enhanced = scoreVoiceQuality(v("Samantha (Enhanced)"));
    const premium = scoreVoiceQuality(v("Ava (Premium)"));
    const natural = scoreVoiceQuality(v("Microsoft Aria Online (Natural)"));
    expect(enhanced).toBeGreaterThan(compact);
    expect(premium).toBeGreaterThan(compact);
    expect(natural).toBeGreaterThan(compact);
  });

  it("never scores a novelty voice above a plain default voice", () => {
    const plain = scoreVoiceQuality(v("Samantha"));
    const novelty = scoreVoiceQuality(v("Bad News (Novelty)"));
    expect(novelty).toBeLessThan(plain);
  });

  it("picks the highest-scoring voice from a mixed list", () => {
    const voices = [v("Samantha"), v("Ava (Premium)"), v("Samantha (Compact)")];
    const best = pickBestVoice(voices);
    expect(best?.name).toBe("Ava (Premium)");
  });

  it("prefers English voices over non-English even if non-English scores higher", () => {
    const voices = [v("Amelie (Premium)", "fr-FR"), v("Samantha", "en-US")];
    const best = pickBestVoice(voices);
    expect(best?.lang).toMatch(/^en/i);
  });

  it("returns null for an empty voice list (caller falls back to OS default)", () => {
    expect(pickBestVoice([])).toBeNull();
  });
});
