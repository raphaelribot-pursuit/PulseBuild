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

/**
 * useSimulationStore
 * Source: Technical Architecture v1.0, Section 9 ("simulation status,
 * speed, current step, event queue... startSimulation, pauseSimulation,
 * emitNextEvent, resetSimulation") + Section 12 (Simulation Engine
 * Architecture — Scripted demo / Timed mode / demo reset).
 *
 * This is the ONE place a JS timer (setInterval) is allowed to live in
 * the whole app — everything it drives (simulationRunner's step logic,
 * the agent orchestrator, the engines) stays pure. Each tick calls
 * `advanceRunner` (simulation/simulationRunner.ts) to get the next
 * scripted signal id, then hands it to `useAgentStore.ingestSignal` so
 * the Command Center re-renders with the new signal already analyzed.
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
  /** Changes playback speed. If currently running, restarts the timer at
   * the new interval immediately rather than waiting for the next tick. */
  setSpeed: (ms: number) => void;
}

// The interval handle is intentionally NOT store state — per the
// Architecture Section 9 state update rule, store state should be
// structured/serializable data, not a live timer handle.
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function clearRunningInterval() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export const useSimulationStore = create<SimulationStoreState>((set, get) => {
  function emitOne() {
    const { next, emittedId } = advanceRunner(get().runner);

    if (emittedId) {
      useAgentStore.getState().ingestSignal(emittedId);
    }

    if (isRunnerComplete(next)) {
      clearRunningInterval();
      set({ runner: next, status: "completed" });
    } else {
      set({ runner: next });
    }
  }

  return {
    status: "idle",
    speedMs: DEFAULT_EVENT_INTERVAL_MS,
    runner: initRunner(),

    startSimulation: () => {
      const { status } = get();
      if (status === "running" || status === "completed") return;

      set({ status: "running" });
      clearRunningInterval();
      intervalHandle = setInterval(emitOne, get().speedMs);
    },

    pauseSimulation: () => {
      if (get().status !== "running") return;
      clearRunningInterval();
      set({ status: "paused" });
    },

    resetSimulation: () => {
      clearRunningInterval();
      useAgentStore.getState().resetAgentState();
      useProjectStore.getState().resetToSeed();
      set({ status: "idle", runner: initRunner() });
    },

    stepEvent: () => {
      const { status } = get();
      if (status === "running" || status === "completed") return;
      emitOne();
      if (get().status === "idle") set({ status: "paused" });
    },

    setSpeed: (ms: number) => {
      const wasRunning = get().status === "running";
      set({ speedMs: ms });
      if (wasRunning) {
        clearRunningInterval();
        intervalHandle = setInterval(emitOne, ms);
      }
    },
  };
});
