import { create } from "zustand";
import {
  initRunner,
  advanceRunner,
  isRunnerComplete,
  SimulationRunnerState,
} from "@/simulation/simulationRunner";
import { DEFAULT_EVENT_INTERVAL_MS } from "@/simulation/simulationEvents";
import { useAgentStore } from "./useAgentStore";
import { useProjectStore } from "./useProjectStore";
import { useUIStore } from "./useUIStore";
import { shouldSpeak, isBrowserSpeaking } from "@/lib/voiceAdapter";
import { isCloudSpeaking } from "@/lib/cloudVoiceAdapter";

/**
 * useSimulationStore
 * Source: Technical Architecture v1.0, Section 9 ("simulation status,
 * speed, current step, event queue... startSimulation, pauseSimulation,
 * emitNextEvent, resetSimulation") + Section 12 (Simulation Engine
 * Architecture — Scripted demo / Timed mode / demo reset).
 *
 * This is the ONE place a JS timer is allowed to live in the whole app
 * — everything it drives (simulationRunner's step logic, the agent
 * orchestrator, the engines) stays pure. Each tick calls `advanceRunner`
 * (simulation/simulationRunner.ts) to get the next scripted signal id,
 * then hands it to `useAgentStore.ingestSignal` so the Command Center
 * re-renders with the new signal already analyzed.
 *
 * PACING NOTE (v3): speedMs (default DEFAULT_EVENT_INTERVAL_MS, 5-10s per
 * spec) is a FLOOR, not a fixed interval. Several seed signals qualify
 * for a spoken alert (Tier 1, or critical-path Tier 2).
 *
 * v1 used a flat interval — events outran speech.
 * v2 estimated speech duration from word count (estimateSpeechDurationMs)
 * and held the next tick for that estimate. This worked for the browser
 * voice (a fixed, predictable ~155wpm rate with no start-up delay) but
 * broke again once ElevenLabs was added as a second provider: cloud TTS
 * has a real, variable network round-trip (audio generation + download)
 * before playback even starts, which a word-count estimate has no way to
 * account for — so events kept firing before cloud audio had actually
 * finished.
 * v3 (current): stops estimating and polls REAL completion instead —
 * isBrowserSpeaking()/isCloudSpeaking() report whether voice is actually
 * still active, for whichever provider is selected. The next tick waits
 * for that to go false (capped by MAX_VOICE_WAIT_MS as a safety net so a
 * stuck/errored alert can never hang the demo indefinitely), with
 * speedMs still enforced as the minimum gap between events either way.
 */

export type SimulationStatus = "idle" | "running" | "paused" | "completed";

export interface SimulationStoreState {
  status: SimulationStatus;
  speedMs: number;
  runner: SimulationRunnerState;

  /** Begins/resumes timed playback. No-op if already running or if the
   * script has completed (reset first to play again). */
  startSimulation: () => void;
  /** Stops the timer without losing progress. */
  pauseSimulation: () => void;
  /** Clears the timer, rewinds the runner, and tells useAgentStore to
   * drop all revealed signals — full return to the pre-simulation empty
   * state (SoT Section 19: "Demo reset — reset project state to initial
   * seed"). */
  resetSimulation: () => void;
  /** Manually advances exactly one scripted event ("step mode",
   * Architecture Section 12) without starting the timer. Disabled while
   * the timer is already running to avoid double-advancing on the same
   * tick. */
  stepEvent: () => void;
  /** Changes playback speed (floor between ticks). If currently
   * running, restarts the timer at the new interval immediately rather
   * than waiting for the next tick. */
  setSpeed: (ms: number) => void;
}

// The timer handle is intentionally NOT store state — per the
// Architecture Section 9 state update rule, store state should be
// structured/serializable data, not a live timer handle.
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

// Incremented on every pause/reset/setSpeed so an in-flight async
// wait-for-voice chain (see waitBeforeNextTick) can detect it's gone
// stale and bail out instead of scheduling a duplicate concurrent tick
// chain — since that wait isn't a plain setTimeout, clearTimeout alone
// can't cancel it once it's already polling.
let tickGeneration = 0;

function clearRunningTimer() {
  tickGeneration++;
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVoiceBusy(): boolean {
  return isBrowserSpeaking() || isCloudSpeaking();
}

// Safety cap: even if voice never reports idle (a genuinely stuck
// browser API state, or a provider bug), the simulation resumes after
// this long rather than hanging the demo indefinitely.
const MAX_VOICE_WAIT_MS = 25_000;

/** Resolves once it's safe to advance to the next event: at least
 * floorMs has elapsed, AND if the just-emitted signal will speak, voice
 * has actually finished (polled, not estimated) or MAX_VOICE_WAIT_MS has
 * passed, whichever comes first. */
async function waitBeforeNextTick(emittedId: string | null, floorMs: number): Promise<void> {
  const floorPromise = wait(floorMs);

  if (!emittedId) {
    await floorPromise;
    return;
  }

  const analysis = useAgentStore.getState().analyses.find((a) => a.signal.id === emittedId);
  if (!analysis) {
    await floorPromise;
    return;
  }

  const { voiceMuted, tier2VoiceEnabled } = useUIStore.getState();
  const willSpeak = shouldSpeak({ analysis, muted: voiceMuted, tier2VoiceEnabled });
  if (!willSpeak) {
    await floorPromise;
    return;
  }

  // Give React a moment to commit the ingestSignal state update and let
  // VoiceEngine's effect actually call speak()/speakCloud() — without
  // this, isVoiceBusy() could be checked before playback has even
  // started and return false prematurely.
  await wait(50);

  const pollStart = Date.now();
  while (isVoiceBusy() && Date.now() - pollStart < MAX_VOICE_WAIT_MS) {
    await wait(200);
  }

  // Still respect the documented floor as the minimum gap even if voice
  // finished well before it (e.g. a short Tier 2 alert on a fast tick).
  await floorPromise;
}

export const useSimulationStore = create<SimulationStoreState>((set, get) => {
  function armTick(delay: number) {
    const gen = tickGeneration;
    timeoutHandle = setTimeout(() => {
      if (gen !== tickGeneration) return; // a pause/reset/setSpeed happened during the delay
      runTick(gen);
    }, delay);
  }

  function runTick(gen: number) {
    const { next, emittedId } = advanceRunner(get().runner);
    const floorMs = get().speedMs;

    if (emittedId) {
      useAgentStore.getState().ingestSignal(emittedId);
    }

    if (isRunnerComplete(next)) {
      clearRunningTimer();
      set({ runner: next, status: "completed" });
      return;
    }

    set({ runner: next });

    void waitBeforeNextTick(emittedId, floorMs).then(() => {
      if (gen !== tickGeneration) return; // stale chain — a pause/reset/setSpeed happened mid-wait
      if (get().status !== "running") return;
      armTick(0);
    });
  }

  return {
    status: "idle",
    speedMs: DEFAULT_EVENT_INTERVAL_MS,
    runner: initRunner(),

    startSimulation: () => {
      const { status } = get();
      if (status === "running" || status === "completed") return;

      set({ status: "running" });
      clearRunningTimer();
      armTick(get().speedMs);
    },

    pauseSimulation: () => {
      if (get().status !== "running") return;
      clearRunningTimer();
      set({ status: "paused" });
    },

    resetSimulation: () => {
      clearRunningTimer();
      useAgentStore.getState().resetAgentState();
      useProjectStore.getState().resetToSeed();
      set({ status: "idle", runner: initRunner() });
    },

    stepEvent: () => {
      const { status } = get();
      if (status === "running" || status === "completed") return;
      const { next, emittedId } = advanceRunner(get().runner);
      if (emittedId) {
        useAgentStore.getState().ingestSignal(emittedId);
      }
      set({
        runner: next,
        status: isRunnerComplete(next) ? "completed" : "paused",
      });
      // Pacing (waitBeforeNextTick/armTick) intentionally not invoked
      // here — there is no timer to pace in step mode; the user advances
      // manually.
    },

    setSpeed: (ms: number) => {
      const wasRunning = get().status === "running";
      set({ speedMs: ms });
      if (wasRunning) {
        clearRunningTimer();
        armTick(ms);
      }
    },
  };
});
