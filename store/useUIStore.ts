import { create } from "zustand";
import { User } from "@/domain/types";
import { seedUsers, DEFAULT_USER_ID } from "@/data";

/**
 * useUIStore
 * Source: Technical Architecture v1.0, Section 9 — "selected signal,
 * filters, panels, muted voice, modal state."
 *
 * Phase 7 scope: only `voiceMuted` is wired to anything real right now
 * (the VoiceStatusBadge mute toggle + VoiceEngine's mute check).
 * `selectedSignalId` is included because LiveSignalFeed's "select signal"
 * action (Architecture Section 10) is a natural near-term follow-up, but
 * nothing reads it yet — left as a documented no-op rather than building
 * a signal detail panel that's out of Phase 7 scope.
 */
export interface UIStoreState {
  voiceMuted: boolean;
  toggleVoiceMute: () => void;

  /** Phase 8: user opt-in to also hear Tier 2 alerts that aren't on the
   * critical path (Architecture Section 14: "Speak Tier 2 only if
   * critical path impact is high OR user enables it" — the OR branch was
   * unwired until now). */
  tier2VoiceEnabled: boolean;
  toggleTier2Voice: () => void;

  /** Post-Phase-8 addition: explicit voice override for the voice
   * adapter's speechSynthesis calls (see lib/voiceAdapter.ts). Null
   * means "auto-pick the best-scoring installed voice" — the default
   * behavior. Set by the voice picker in VoiceStatusBadge once the
   * browser reports available voices. Stored as a voiceURI string
   * (not the SpeechSynthesisVoice object itself, which isn't
   * serializable/stable across the store per the Architecture Section
   * 9 state rule). */
  voiceURI: string | null;
  setVoiceURI: (voiceURI: string | null) => void;

  /** Post-Phase-8 addition: choice between the free browser
   * SpeechSynthesis path (lib/voiceAdapter.ts) and cloud ElevenLabs TTS
   * (lib/cloudVoiceAdapter.ts). Defaults to "browser" — cloud requires an
   * ELEVENLABS_API_KEY the user may not have set up, so it must be an
   * explicit opt-in, never a silent default that breaks the demo if the
   * key's missing or the free-tier quota runs out. */
  voiceProvider: "browser" | "elevenlabs";
  setVoiceProvider: (provider: "browser" | "elevenlabs") => void;

  selectedSignalId: string | null;
  selectSignal: (signalId: string | null) => void;

  /** Part 1 (mock roles) added `currentUser`/`switchUser` as a
   * dropdown-driven stand-in for a real session. Part 2 wires a real
   * Clerk session in via components/auth/UserSync.tsx, which calls
   * `setCurrentUser` once Clerk reports the signed-in user + their
   * publicMetadata.role. Nothing in the approval pipeline or UI changed
   * to support this — it was already written to only ever read
   * `.role`/`.id` off whatever `currentUser` is, regardless of source.
   * `switchUser` is kept only as a test/dev convenience for picking a
   * seed user without a live Clerk session (see tests/engines/
   * approvalRoles.test.ts) — the real app no longer exposes it in the
   * UI now that CommandTopBar reads the actual Clerk session. */
  currentUser: User;
  setCurrentUser: (user: User) => void;
  switchUser: (userId: string) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  voiceMuted: false,
  toggleVoiceMute: () => set((s) => ({ voiceMuted: !s.voiceMuted })),

  tier2VoiceEnabled: false,
  toggleTier2Voice: () => set((s) => ({ tier2VoiceEnabled: !s.tier2VoiceEnabled })),

  voiceURI: null,
  setVoiceURI: (voiceURI) => set({ voiceURI }),

  voiceProvider: "browser",
  setVoiceProvider: (voiceProvider) => set({ voiceProvider }),

  selectedSignalId: null,
  selectSignal: (signalId) => set({ selectedSignalId: signalId }),

  // Defaults to the seed superintendent until UserSync overwrites this
  // with the real Clerk session on mount — avoids a null-currentUser
  // case throughout the rest of the app for the brief window before
  // Clerk reports isLoaded.
  currentUser: seedUsers.find((u) => u.id === DEFAULT_USER_ID)!,
  setCurrentUser: (user) => set({ currentUser: user }),
  switchUser: (userId) =>
    set((s) => {
      const next = seedUsers.find((u) => u.id === userId);
      return next ? { currentUser: next } : s;
    }),
}));
