"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { getAvailableVoices, pickBestVoice, VoiceCandidate } from "@/lib/voiceAdapter";

/**
 * VoiceStatusBadge
 * Source: Technical Architecture v1.0, Section 10 (Component table —
 * "VoiceStatusBadge — Voice state — Reads from UI store — Mute/unmute").
 * Phase 8: also exposes the Tier 2 opt-in toggle here rather than a
 * separate component — it's a second, closely-related voice setting,
 * not a distinct piece of UI state worth its own component per the
 * Architecture Section 10 table.
 *
 * Post-Phase-8: also exposes a voice picker. speechSynthesis defaults to
 * whatever the OS reports first, which is usually its lowest-quality
 * "compact" voice — not any higher-quality voice (macOS Enhanced/
 * Premium, Windows "Online (Natural)", etc.) that may also be installed.
 * This lists what's actually available and lets the presenter pick one,
 * defaulting to the auto-picked best-scoring voice (see
 * lib/voiceAdapter.ts's pickBestVoice).
 */
export function VoiceStatusBadge() {
  const voiceMuted = useUIStore((s) => s.voiceMuted);
  const toggleVoiceMute = useUIStore((s) => s.toggleVoiceMute);
  const tier2VoiceEnabled = useUIStore((s) => s.tier2VoiceEnabled);
  const toggleTier2Voice = useUIStore((s) => s.toggleTier2Voice);
  const voiceURI = useUIStore((s) => s.voiceURI);
  const setVoiceURI = useUIStore((s) => s.setVoiceURI);
  const voiceProvider = useUIStore((s) => s.voiceProvider);
  const setVoiceProvider = useUIStore((s) => s.setVoiceProvider);

  const [voices, setVoices] = useState<VoiceCandidate[]>([]);
  const [voicesLoadFailed, setVoicesLoadFailed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      const t = setTimeout(() => setVoicesLoadFailed(true), 0);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 10; // ~3s total at 300ms apart
    let pollHandle: ReturnType<typeof setTimeout> | null = null;

    function tryLoad() {
      const found = getAvailableVoices();
      if (cancelled) return;

      if (found.length > 0) {
        setVoices(found);
        return; // got them — no need to keep polling
      }

      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        setVoicesLoadFailed(true); // genuinely no voices reported after retrying
        return;
      }
      pollHandle = setTimeout(tryLoad, 300);
    }

    // The 'voiceschanged' event is the documented way to know the list is
    // ready, but it's unreliable across browsers: some fire it before a
    // listener can be attached (if the list was already populated earlier
    // in the browser session), some don't fire it at all. Polling as a
    // fallback means the picker still appears either way, instead of
    // silently staying empty.
    window.speechSynthesis.addEventListener("voiceschanged", tryLoad);
    tryLoad();

    return () => {
      cancelled = true;
      if (pollHandle) clearTimeout(pollHandle);
      window.speechSynthesis.removeEventListener("voiceschanged", tryLoad);
    };
  }, []);

  const autoPicked = pickBestVoice(voices);

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
      <button
        onClick={() => setVoiceProvider(voiceProvider === "browser" ? "elevenlabs" : "browser")}
        disabled={voiceMuted}
        className={`text-[10px] font-data uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          voiceProvider === "elevenlabs"
            ? "text-signal-cyan border-signal-cyan/40 hover:bg-signal-cyan/10"
            : "text-muted-text border-white/10 hover:border-white/20"
        }`}
        title="Switch between the free browser voice and cloud ElevenLabs TTS. ElevenLabs requires ELEVENLABS_API_KEY to be set; falls back to the browser voice automatically if the cloud call fails."
      >
        {voiceProvider === "elevenlabs" ? "Voice src: ElevenLabs" : "Voice src: Browser"}
      </button>
      {voiceProvider === "browser" && voices.length > 0 && (
        <select
          value={voiceURI ?? ""}
          onChange={(e) => setVoiceURI(e.target.value || null)}
          disabled={voiceMuted}
          title="Voice used for spoken alerts. 'Auto' picks the best-quality voice installed. Note: on macOS this lists System Settings > Spoken Content voices (e.g. 'Samantha'), not Siri's persona names (e.g. 'American (Voice 5)') — those are a separate voice list the browser can't access."
          className="text-[10px] font-data uppercase tracking-wide rounded-full px-2 py-0.5 border border-white/10 bg-transparent text-muted-text hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed max-w-[140px]"
        >
          <option value="">Auto{autoPicked ? ` (${autoPicked.name})` : ""}</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
            </option>
          ))}
        </select>
      )}
      {voiceProvider === "browser" && voices.length === 0 && voicesLoadFailed && (
        <span
          className="text-[10px] font-data uppercase tracking-wide rounded-full px-2 py-0.5 border border-white/10 text-muted-text opacity-60"
          title="This browser didn't report any installed voices. Spoken alerts will still use the OS default."
        >
          Voice: System default
        </span>
      )}
    </div>
  );
}
