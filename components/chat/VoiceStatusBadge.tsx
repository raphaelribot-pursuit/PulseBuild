"use client";

import { useUIStore } from "@/store/useUIStore";

/**
 * VoiceStatusBadge
 * Source: Technical Architecture v1.0, Section 10 (Component table —
 * "VoiceStatusBadge — Voice state — Reads from UI store — Mute/unmute").
 * Phase 8: also exposes the Tier 2 opt-in toggle here rather than a
 * separate component — it's a second, closely-related voice setting,
 * not a distinct piece of UI state worth its own component per the
 * Architecture Section 10 table.
 */
export function VoiceStatusBadge() {
  const voiceMuted = useUIStore((s) => s.voiceMuted);
  const toggleVoiceMute = useUIStore((s) => s.toggleVoiceMute);
  const tier2VoiceEnabled = useUIStore((s) => s.tier2VoiceEnabled);
  const toggleTier2Voice = useUIStore((s) => s.toggleTier2Voice);

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={toggleVoiceMute}
        className={`text-[10px] font-data uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors ${
          voiceMuted
            ? "text-muted-text border-white/10 hover:border-white/20"
            : "text-build-green border-build-green/40 hover:bg-build-green/10"
        }`}
        title="Tier 1 alerts speak automatically unless muted."
      >
        Voice: {voiceMuted ? "Muted" : "On"}
      </button>
      <button
        onClick={toggleTier2Voice}
        disabled={voiceMuted}
        className={`text-[10px] font-data uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          tier2VoiceEnabled
            ? "text-signal-cyan border-signal-cyan/40 hover:bg-signal-cyan/10"
            : "text-muted-text border-white/10 hover:border-white/20"
        }`}
        title="Off the critical path, Tier 2 alerts only speak if this is enabled."
      >
        Tier 2: {tier2VoiceEnabled ? "On" : "Off"}
      </button>
    </div>
  );
}
