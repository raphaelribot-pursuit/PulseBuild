import { ProjectSignal } from "@/domain/types";
import { seedSignals } from "@/data";

/**
 * Simulation Events
 * Source: Technical Architecture v1.0, Section 12 (Simulation Engine
 * Architecture) — "Scripted demo: events fire in fixed order... Class
 * presentation and reliable testing." + SoT v2.0 Section 19 (Simulation
 * Engine — event interval default 5-10 seconds; "same scenario should
 * produce same result unless Product Owner enables randomness").
 *
 * Phase 5 scope: scripted mode + timed playback + reset, per the current
 * build request. Step mode falls out for free (see simulationRunner.ts —
 * advanceRunner can be called directly without a timer) but has no
 * dedicated UI yet. Randomized mode is explicitly "optional polish after
 * MVP" per Architecture Section 12 and is intentionally not built here.
 */

/** Default playback interval between events. Architecture Section 12:
 * "Timed mode: Events fire every N seconds... Default every 5-10
 * seconds." Set to the top of that range (10s) rather than 6s: with 12
 * seed signals this yields a 120s (2 min) full playthrough instead of
 * 72s, giving Tier 1 voice alerts (which can run up to ~20s per the
 * Phase 7 handoff) enough spacing that they don't collide/overlap. */
export const DEFAULT_EVENT_INTERVAL_MS = 10000;

/**
 * Builds the fixed scripted playback order.
 *
 * IMPORTANT: this returns signal ids in ARRAY order, not sorted by
 * `createdAt`. data/seedSignals.ts is explicit that "ordering here is the
 * intended playback order" — sig_09/sig_10/sig_11 are archived signals
 * with old historical timestamps (used to demonstrate lifecycle status
 * variety, per Phase 2 notes) but are meant to play LAST in the demo
 * narrative, not first. Sorting by createdAt would silently break that
 * authored narrative, so this only reorders if the caller passes a
 * different array — the default seed order is trusted as-is.
 *
 * Deterministic: same input always produces the same output (SoT Section
 * 19's "same scenario should produce same result" requirement).
 */
export function buildScriptedQueue(
  signals: ProjectSignal[] = seedSignals
): string[] {
  return signals.map((s) => s.id);
}
