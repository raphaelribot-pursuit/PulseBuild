import { create } from "zustand";

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

  selectedSignalId: string | null;
  selectSignal: (signalId: string | null) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  voiceMuted: false,
  toggleVoiceMute: () => set((s) => ({ voiceMuted: !s.voiceMuted })),

  tier2VoiceEnabled: false,
  toggleTier2Voice: () => set((s) => ({ tier2VoiceEnabled: !s.tier2VoiceEnabled })),

  selectedSignalId: null,
  selectSignal: (signalId) => set({ selectedSignalId: signalId }),
}));
