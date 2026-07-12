import { SignalAnalysis } from "@/agent/agentOrchestrator";
import { formatSignalType } from "@/lib/formatters";

/**
 * Voice Adapter
 * Source: Technical Architecture v1.0, Section 14 (Voice adapter rules):
 *  - Use browser SpeechSynthesis API for MVP.
 *  - Speak Tier 1 automatically unless muted.
 *  - Speak Tier 2 only if critical path impact is high or user enables it.
 *  - Never speak Tier 3 or Tier 4 by default.
 *  - No duplicate voice loops for the same signal.
 *  - Voice text must be under 20 seconds and include issue, impact, and
 *    required action.
 *
 * Split into pure decision/text functions (unit-testable, no browser API)
 * and a thin `speak()` wrapper around window.speechSynthesis (untestable
 * in vitest's jsdom-less environment, kept deliberately tiny).
 */

export interface VoiceDecisionInput {
  analysis: SignalAnalysis;
  muted: boolean;
  /** User has explicitly opted into hearing Tier 2 alerts, not just
   * critical-path ones. Defaults to false — Architecture Section 14 only
   * requires Tier 2 speech "if critical path impact is high OR user
   * enables it." */
  tier2VoiceEnabled?: boolean;
}

export function shouldSpeak(input: VoiceDecisionInput): boolean {
  const { analysis, muted, tier2VoiceEnabled } = input;
  if (muted) return false;

  const { tier } = analysis.priority;
  if (tier === "Tier1") return true;
  if (tier === "Tier2") {
    return analysis.dependencies.criticalPathImpact || Boolean(tier2VoiceEnabled);
  }
  return false; // Tier3/Tier4 never speak by default
}

/** Keeps output short enough to stay under ~20 seconds of speech
 * (roughly 3 short sentences at a natural speaking pace) while still
 * covering issue, impact, and required action per the Architecture
 * rule. */
export function buildVoiceText(analysis: SignalAnalysis): string {
  const { signal, priority, dependencies, recommendation } = analysis;

  const issue = `${priority.tier === "Tier1" ? "Critical alert" : "Alert"}: ${formatSignalType(
    signal.type
  )}${signal.relatedTaskId ? ` on ${signal.relatedTaskId.replace(/_/g, " ")}` : ""}.`;

  const impact = dependencies.criticalPathImpact
    ? "This is on the critical path."
    : dependencies.affectedTaskIds.length > 0
      ? `${dependencies.affectedTaskIds.length} downstream task${
          dependencies.affectedTaskIds.length === 1 ? "" : "s"
        } affected.`
      : "";

  const action = recommendation ? `Recommended action: ${recommendation.action}` : "";

  return [issue, impact, action].filter(Boolean).join(" ");
}

/** Module-level record of signal ids already spoken this session — the
 * "no duplicate voice loops for the same signal" rule. Deliberately not
 * in Zustand: this is a side-effect bookkeeping detail of the adapter,
 * not shared UI state anything else needs to read. */
const spokenSignalIds = new Set<string>();

export function hasSpoken(signalId: string): boolean {
  return spokenSignalIds.has(signalId);
}

export function markSpoken(signalId: string): void {
  spokenSignalIds.add(signalId);
}

/** Reset for a new simulation run (called from resetAgentState wiring)
 * so a re-triggered signal can speak again. */
export function resetSpokenSignals(): void {
  spokenSignalIds.clear();
}

/** Thin wrapper around the actual browser API. No-ops outside the
 * browser (SSR) or if SpeechSynthesis isn't supported. */
export function speak(text: string): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel(); // no overlapping utterances
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
}
