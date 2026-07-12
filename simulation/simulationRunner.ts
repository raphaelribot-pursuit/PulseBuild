import { ProjectSignal } from "@/domain/types";
import { buildScriptedQueue } from "./simulationEvents";

/**
 * Simulation Runner
 * Source: Technical Architecture v1.0, Section 12 — step logic for
 * scripted playback, kept as pure functions (no setInterval, no store, no
 * React) so it's testable without a browser — same spirit as engines/
 * being "pure functions... testable without React" (Architecture Section
 * 7), even though simulation/ is intentionally a separate folder that
 * must never be imported BY the core engines (Architecture Section 3
 * folder ownership rules). Nothing stops simulation/ from being just as
 * pure and unit-testable on its own, so it is.
 *
 * The actual timer (setInterval) lives in store/useSimulationStore.ts,
 * which calls `advanceRunner` on each tick — that's the only side-effecty
 * part, and it's store-layer, not engine- or simulation-layer.
 */

export interface SimulationRunnerState {
  /** Remaining signal ids, in playback order. */
  queue: string[];
  /** Already-emitted signal ids, in emission order. */
  emitted: string[];
}

/** Builds a fresh runner state from the scripted queue. Pass a custom
 * signal list (e.g. in tests) to avoid depending on the seed data. */
export function initRunner(signals?: ProjectSignal[]): SimulationRunnerState {
  return { queue: buildScriptedQueue(signals), emitted: [] };
}

export interface AdvanceResult {
  next: SimulationRunnerState;
  /** The signal id that was just emitted, or null if the queue was
   * already empty (nothing left to advance). */
  emittedId: string | null;
}

/**
 * Advances the runner by exactly one scripted event. Pure — returns a
 * new state rather than mutating the one passed in. Safe to call on an
 * already-complete runner: returns the same state and a null emittedId
 * rather than throwing, so callers don't need to guard every call site.
 */
export function advanceRunner(state: SimulationRunnerState): AdvanceResult {
  if (state.queue.length === 0) {
    return { next: state, emittedId: null };
  }
  const [emittedId, ...rest] = state.queue;
  return {
    next: { queue: rest, emitted: [...state.emitted, emittedId] },
    emittedId,
  };
}

export function isRunnerComplete(state: SimulationRunnerState): boolean {
  return state.queue.length === 0;
}
