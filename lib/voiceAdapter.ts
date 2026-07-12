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

/** Minimal shape we actually read off SpeechSynthesisVoice — kept as our
 * own interface (rather than importing the DOM lib type) so scoring/
 * selection stays pure and unit-testable outside a browser. */
export interface VoiceCandidate {
  voiceURI: string;
  name: string;
  lang: string;
}

/**
 * Voice quality scoring.
 * Default OS voices exposed to SpeechSynthesis are typically the
 * lowest-quality "compact" tier (e.g. macOS's plain "Samantha," Windows'
 * plain "Microsoft David/Zira"). Every major platform also exposes
 * higher-quality voices through the SAME API once installed/available —
 * macOS "Enhanced"/"Premium" voices (the same engine Siri uses), Windows
 * Edge's cloud-backed "Online (Natural)" voices, Chrome/Android's Google
 * voices. speechSynthesis has no explicit "quality" field, so we score by
 * name patterns that reliably show up across these tiers.
 *
 * Pure and platform-agnostic on purpose: no OS detection, just scoring
 * whatever voice list the browser actually reports, so the same logic
 * picks the best available voice on any machine running the demo.
 */
const QUALITY_HINTS: { pattern: RegExp; weight: number }[] = [
  { pattern: /premium/i, weight: 4 },
  { pattern: /enhanced/i, weight: 4 },
  { pattern: /neural/i, weight: 4 },
  { pattern: /natural/i, weight: 4 }, // e.g. "Microsoft Aria Online (Natural)"
  { pattern: /online/i, weight: 1 }, // cloud-backed voices tend to sound better than on-device compact ones
  // Named macOS voices that ship at Enhanced/Premium quality even when
  // the suffix isn't present in every OS version's naming:
  { pattern: /\b(ava|zoe|evan|nathan|allison|tom)\b/i, weight: 2 },
  { pattern: /\bgoogle\b/i, weight: 1 },
];

const LOW_QUALITY_HINTS: { pattern: RegExp; weight: number }[] = [
  { pattern: /compact/i, weight: -3 },
  { pattern: /\bnovelty\b/i, weight: -5 }, // e.g. "Bad News", "Bells" — never appropriate for a demo
];

export function scoreVoiceQuality(voice: VoiceCandidate): number {
  let score = 0;
  for (const { pattern, weight } of [...QUALITY_HINTS, ...LOW_QUALITY_HINTS]) {
    if (pattern.test(voice.name)) score += weight;
  }
  return score;
}

/** Picks the best-scoring English voice from whatever the browser
 * reports as available. Falls back to the best-scoring voice of any
 * language, then to null (caller falls back to the OS default) if the
 * list is empty. Ties broken by list order (stable, deterministic). */
export function pickBestVoice(voices: VoiceCandidate[]): VoiceCandidate | null {
  if (voices.length === 0) return null;

  const english = voices.filter((v) => /^en/i.test(v.lang));
  const pool = english.length > 0 ? english : voices;

  return [...pool].sort((a, b) => scoreVoiceQuality(b) - scoreVoiceQuality(a))[0];
}

/** Pure estimate of how long buildVoiceText's output will take to speak
 * at the SpeechSynthesisUtterance default rate (rate = 1.0, ~155 words/
 * minute is a reasonable average across browser TTS voices). Used by
 * the simulation layer to pace event playback around voice alerts —
 * kept here as a pure function (no browser API) so it's directly
 * unit-testable and reusable outside a browser context. A fixed 1200ms
 * buffer is added on top of the raw estimate: short pause between
 * utterances plus margin for slower voices/engines. */
export function estimateSpeechDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const WORDS_PER_MINUTE = 155;
  const speakingMs = (words / WORDS_PER_MINUTE) * 60_000;
  const BUFFER_MS = 1200;
  return Math.round(speakingMs + BUFFER_MS);
}

/** Browser wrapper around speechSynthesis.getVoices(). Voice lists load
 * asynchronously on most browsers (fired via the 'voiceschanged' event),
 * so an empty array on first call is normal — callers should re-check
 * after that event, which VoiceEngine's mount effect does. Returns our
 * plain VoiceCandidate shape so it composes with the pure functions
 * above. */
export function getAvailableVoices(): VoiceCandidate[] {
  if (typeof window === "undefined") return [];
  if (!("speechSynthesis" in window)) return [];

  const raw = window.speechSynthesis.getVoices().map((v) => ({
    voiceURI: v.voiceURI,
    name: v.name,
    lang: v.lang,
  }));

  // macOS Chrome/Safari are known to report the same voice twice (same
  // voiceURI) because the OS registers each voice through more than one
  // internal service. Since voiceURI is used as the React key for the
  // picker's <option> list, undeduped duplicates trigger React's
  // "two children with the same key" warning — repeatedly, since this
  // list is re-fetched on every voiceschanged event and poll tick.
  // Dedupe by voiceURI here so every consumer gets a clean list.
  const seen = new Set<string>();
  return raw.filter((v) => {
    if (seen.has(v.voiceURI)) return false;
    seen.add(v.voiceURI);
    return true;
  });
}

/** Real-time check of whether the browser voice is currently speaking or
 * has anything queued. Used by the simulation's pacing logic to wait for
 * ACTUAL completion rather than an estimate — see isCloudSpeaking in
 * cloudVoiceAdapter.ts for the equivalent on the ElevenLabs path. */
export function isBrowserSpeaking(): boolean {
  if (typeof window === "undefined") return false;
  if (!("speechSynthesis" in window)) return false;
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

/** Thin wrapper around the actual browser API. No-ops outside the
 * browser (SSR) or if SpeechSynthesis isn't supported.
 *
 * IMPORTANT: does NOT call speechSynthesis.cancel() here. An earlier
 * version cancelled before every utterance to prevent overlap, but that
 * actually caused the opposite problem: if a signal fired while a prior
 * alert was still mid-sentence, cancel() cut it off and immediately
 * replaced it — audible as alerts "colliding." The Web Speech API
 * queues utterances natively when you call speak() repeatedly without
 * cancelling, so leaning on that queue means every alert is heard in
 * full, back to back, in the order signals actually occurred.
 *
 * Voice selection: if `preferredVoiceURI` is given (the user's explicit
 * choice, e.g. from a settings dropdown), use that exact voice if it's
 * still available. Otherwise auto-pick the best-scoring installed voice
 * via pickBestVoice — this is what actually fixes "sounds robotic by
 * default": browsers silently default to the lowest-quality system
 * voice unless a voice is explicitly assigned on the utterance. */
export function speak(text: string, preferredVoiceURI?: string | null): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;

  const voices = getAvailableVoices();
  const chosen =
    (preferredVoiceURI && voices.find((v) => v.voiceURI === preferredVoiceURI)) ||
    pickBestVoice(voices);

  if (chosen) {
    const nativeVoice = window.speechSynthesis
      .getVoices()
      .find((v) => v.voiceURI === chosen.voiceURI);
    if (nativeVoice) utterance.voice = nativeVoice;
  }

  window.speechSynthesis.speak(utterance);
}

/** Explicit, intentional interrupt — used only for mute and simulation
 * reset, where we WANT to drop anything queued/speaking immediately,
 * as opposed to normal playback where alerts should queue and finish. */
export function stopSpeech(): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
}
