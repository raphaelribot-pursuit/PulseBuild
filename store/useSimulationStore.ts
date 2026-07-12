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
import { shouldSpeak, buildVoiceText, estimateSpeechDurationMs } from "@/lib/voiceAdapter";

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
 * PACING NOTE: speedMs (default DEFAULT_EVENT_INTERVAL_MS, 5-10s per
 * spec) is a FLOOR, not a fixed interval. Several seed signals qualify
 * for a spoken alert (Tier 1, or critical-path Tier 2), and those
 * alerts run up to ~20s. A flat interval front-loads more speech than
 * can be spoken in the time available (seed data has 7 voice-eligible
 * signals in a row), so alerts drift audibly behind the event they
 * describe. Rather than raising the base interval (which would break
 * the documented 5-10s default), each tick checks whether the signal it
 * just emitted will speak and, if so, holds the next tick until that
 * alert has had time to finish — using a setTimeout chain instead of
 * setInterval so the delay can vary per tick.
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
// structured/serializable data, not a live timer handle. Named
// "timeoutHandle" (not intervalHandle) since pacing now uses a
// self-rescheduling setTimeout chain rather than setInterval.
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

function clearRunningTimer() {
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
}

export const useSimulationStore = create<SimulationStoreState>((set, get) => {
  /** How long to wait before the NEXT tick, given the signal that was
   * just emitted. Always at least speedMs (the documented floor); if
   * the emitted signal will trigger a voice alert, extended to cover
   * the estimated length of that alert so events don't outrun speech. */
  function delayAfter(emittedId: string | null, floorMs: number): number {
    if (!emittedId) return floorMs;

    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === emittedId);
    if (!analysis) return floorMs;

    const { voiceMuted, tier2VoiceEnabled } = useUIStore.getState();
    const willSpeak = shouldSpeak({ analysis, muted: voiceMuted, tier2VoiceEnabled });
    if (!willSpeak) return floorMs;

    const speechMs = estimateSpeechDurationMs(buildVoiceText(analysis));
    return Math.max(floorMs, speechMs);
  }

  function scheduleNext(delay: number) {
    timeoutHandle = setTimeout(tick, delay);
  }

  function tick() {
    const floorMs = get().speedMs;
    const { next, emittedId } = advanceRunner(get().runner);

    if (emittedId) {
      useAgentStore.getState().ingestSignal(emittedId);
    }

    if (isRunnerComplete(next)) {
      clearRunningTimer();
      set({ runner: next, status: "completed" });
      return;
    }

    set({ runner: next });
    scheduleNext(delayAfter(emittedId, floorMs));
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
      scheduleNext(get().speedMs);
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
      // Pacing (delayAfter/scheduleNext) intentionally not invoked here —
      // there is no timer to pace in step mode; the user advances manually.
    },

    setSpeed: (ms: number) => {
      const wasRunning = get().status === "running";
      set({ speedMs: ms });
      if (wasRunning) {
        clearRunningTimer();
        scheduleNext(ms);
      }
    },
  };
});
