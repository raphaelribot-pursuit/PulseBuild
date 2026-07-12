"use client";

import { useEffect } from "react";
import { useAgentStore } from "@/store/useAgentStore";
import { useUIStore } from "@/store/useUIStore";
import { shouldSpeak, buildVoiceText, hasSpoken, markSpoken, speak, stopSpeech } from "@/lib/voiceAdapter";
import { speakCloud, stopCloudSpeech } from "@/lib/cloudVoiceAdapter";

/**
 * VoiceEngine
 * Source: Technical Architecture v1.0, Section 14 (Voice adapter rules).
 * Mounted once near the top of the Command Center. Renders nothing —
 * it's a pure side-effect watcher: whenever `analyses` changes (a new
 * signal is ingested, or an approval/verification updates the set), it
 * checks each analysis against the voice rules and speaks the ones that
 * qualify and haven't already been spoken this session.
 *
 * Post-Phase-8: supports two providers (useUIStore.voiceProvider) — the
 * free browser SpeechSynthesis path, or cloud ElevenLabs TTS. If the
 * cloud call fails (missing/invalid key, free-tier quota exhausted,
 * network issue), this falls back to the browser voice for that alert
 * rather than the demo going silent — a real risk on a free ElevenLabs
 * account with limited monthly credits.
 */
export function VoiceEngine() {
  const analyses = useAgentStore((s) => s.analyses);
  const voiceMuted = useUIStore((s) => s.voiceMuted);
  const tier2VoiceEnabled = useUIStore((s) => s.tier2VoiceEnabled);
  const voiceURI = useUIStore((s) => s.voiceURI);
  const voiceProvider = useUIStore((s) => s.voiceProvider);

  useEffect(() => {
    if (voiceMuted) {
      stopSpeech(); // muting should cut off anything speaking/queued right now
      stopCloudSpeech();
      return;
    }
    for (const analysis of analyses) {
      const signalId = analysis.signal.id;
      if (hasSpoken(signalId)) continue;
      if (!shouldSpeak({ analysis, muted: voiceMuted, tier2VoiceEnabled })) continue;

      const text = buildVoiceText(analysis);
      if (voiceProvider === "elevenlabs") {
        speakCloud(text, (failedText, error) => {
          console.warn("ElevenLabs TTS failed, falling back to browser voice:", error.message);
          speak(failedText, voiceURI);
        });
      } else {
        speak(text, voiceURI);
      }
      markSpoken(signalId);
    }
    // Only re-run when the analyses set changes shape/content, mute
    // toggles, the Tier 2 opt-in changes, or the chosen voice/provider
    // changes — not on every render.
  }, [analyses, voiceMuted, tier2VoiceEnabled, voiceURI, voiceProvider]);

  return null;
}
