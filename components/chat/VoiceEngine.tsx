"use client";

import { useEffect } from "react";
import { useAgentStore } from "@/store/useAgentStore";
import { useUIStore } from "@/store/useUIStore";
import { shouldSpeak, buildVoiceText, hasSpoken, markSpoken, speak } from "@/lib/voiceAdapter";

/**
 * VoiceEngine
 * Source: Technical Architecture v1.0, Section 14 (Voice adapter rules).
 * Mounted once near the top of the Command Center. Renders nothing —
 * it's a pure side-effect watcher: whenever `analyses` changes (a new
 * signal is ingested, or an approval/verification updates the set), it
 * checks each analysis against the voice rules and speaks the ones that
 * qualify and haven't already been spoken this session.
 */
export function VoiceEngine() {
  const analyses = useAgentStore((s) => s.analyses);
  const voiceMuted = useUIStore((s) => s.voiceMuted);
  const tier2VoiceEnabled = useUIStore((s) => s.tier2VoiceEnabled);

  useEffect(() => {
    if (voiceMuted) return;
    for (const analysis of analyses) {
      const signalId = analysis.signal.id;
      if (hasSpoken(signalId)) continue;
      if (!shouldSpeak({ analysis, muted: voiceMuted, tier2VoiceEnabled })) continue;

      speak(buildVoiceText(analysis));
      markSpoken(signalId);
    }
    // Only re-run when the analyses set changes shape/content, mute
    // toggles, or the Tier 2 opt-in changes — not on every render.
  }, [analyses, voiceMuted, tier2VoiceEnabled]);

  return null;
}
