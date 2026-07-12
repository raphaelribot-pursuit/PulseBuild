import { describe, it, expect, beforeEach } from "vitest";
import { buildScriptedQueue, DEFAULT_EVENT_INTERVAL_MS } from "@/simulation/simulationEvents";
import {
  initRunner,
  advanceRunner,
  isRunnerComplete,
} from "@/simulation/simulationRunner";
import { seedSignals } from "@/data";
import { ProjectSignal } from "@/domain/types";

/**
 * Phase 5 — Simulation Engine tests.
 * Source: Technical Architecture v1.0, Section 12 (required demo
 * scenarios + scripted/timed mode) and Section 17 (Testing Strategy —
 * "Simulation tests: Scripted demo reliability... Events fire in correct
 * order and create timeline entries").
 */

function makeSignal(id: string, createdAt: string): ProjectSignal {
  return {
    id,
    projectId: "proj_test",
    type: "minor_delay",
    status: "detected",
    createdAt,
    updatedAt: createdAt,
    source: "simulation",
    confidence: 0.5,
    rawData: {},
  };
}

describe("buildScriptedQueue", () => {
  it("preserves array order rather than sorting by createdAt", () => {
    // sig_b is chronologically earlier but authored second — the queue
    // must respect authored order, not re-sort by date (see
    // simulationEvents.ts for why: archived signals with old timestamps
    // are intentionally scripted to play late in the demo).
    const signals = [
      makeSignal("sig_a", "2026-07-08T09:00:00.000Z"),
      makeSignal("sig_b", "2026-05-01T09:00:00.000Z"),
    ];
    expect(buildScriptedQueue(signals)).toEqual(["sig_a", "sig_b"]);
  });

  it("is deterministic across repeated calls", () => {
    expect(buildScriptedQueue(seedSignals)).toEqual(buildScriptedQueue(seedSignals));
  });

  it("defaults to the full seed signal set in seed order", () => {
    expect(buildScriptedQueue()).toEqual(seedSignals.map((s) => s.id));
  });

  it("uses a 5-10 second default interval per Architecture Section 12", () => {
    expect(DEFAULT_EVENT_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(DEFAULT_EVENT_INTERVAL_MS).toBeLessThanOrEqual(10000);
  });
});

describe("simulationRunner", () => {
  const signals = [
    makeSignal("sig_a", "2026-07-08T09:00:00.000Z"),
    makeSignal("sig_b", "2026-07-08T09:05:00.000Z"),
    makeSignal("sig_c", "2026-07-08T09:10:00.000Z"),
  ];

  it("initRunner builds the full queue with nothing emitted yet", () => {
    const state = initRunner(signals);
    expect(state.queue).toEqual(["sig_a", "sig_b", "sig_c"]);
    expect(state.emitted).toEqual([]);
    expect(isRunnerComplete(state)).toBe(false);
  });

  it("advanceRunner emits one signal at a time, in order", () => {
    let state = initRunner(signals);

    const first = advanceRunner(state);
    expect(first.emittedId).toBe("sig_a");
    expect(first.next.queue).toEqual(["sig_b", "sig_c"]);
    expect(first.next.emitted).toEqual(["sig_a"]);
    state = first.next;

    const second = advanceRunner(state);
    expect(second.emittedId).toBe("sig_b");
    expect(second.next.emitted).toEqual(["sig_a", "sig_b"]);
    state = second.next;

    const third = advanceRunner(state);
    expect(third.emittedId).toBe("sig_c");
    expect(isRunnerComplete(third.next)).toBe(true);
  });

  it("advanceRunner is a no-op once complete, never throws", () => {
    let state = initRunner(signals);
    for (let i = 0; i < signals.length; i++) {
      state = advanceRunner(state).next;
    }
    expect(isRunnerComplete(state)).toBe(true);

    const result = advanceRunner(state);
    expect(result.emittedId).toBeNull();
    expect(result.next).toEqual(state);
  });

  it("advanceRunner never mutates the state passed in (pure function)", () => {
    const state = initRunner(signals);
    const queueBefore = [...state.queue];
    advanceRunner(state);
    expect(state.queue).toEqual(queueBefore);
  });

  it("playing the full seed script terminates and emits every seed signal exactly once", () => {
    let state = initRunner(seedSignals);
    let steps = 0;
    while (!isRunnerComplete(state) && steps < seedSignals.length + 5) {
      state = advanceRunner(state).next;
      steps++;
    }
    expect(isRunnerComplete(state)).toBe(true);
    expect(state.emitted).toHaveLength(seedSignals.length);
    expect(new Set(state.emitted).size).toBe(seedSignals.length);
  });
});

describe("useAgentStore signal ingestion (Phase 5 wiring)", () => {
  beforeEach(async () => {
    const { useAgentStore } = await import("@/store/useAgentStore");
    useAgentStore.getState().resetAgentState();
  });

  it("starts empty before any signal is ingested", async () => {
    const { useAgentStore } = await import("@/store/useAgentStore");
    const state = useAgentStore.getState();
    expect(state.analyses).toHaveLength(0);
    expect(state.topBlocker).toBeNull();
    expect(state.health.overall).toBe(100);
    expect(state.drift.score).toBe(0);
  });

  it("ingestSignal adds exactly one analyzed signal and recomputes health/drift", async () => {
    const { useAgentStore } = await import("@/store/useAgentStore");
    const tier1Signal = seedSignals.find((s) => s.severityHint === "Tier1")!;
    useAgentStore.getState().ingestSignal(tier1Signal.id);

    const state = useAgentStore.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.revealedSignalIds).toEqual([tier1Signal.id]);
    expect(state.health.overall).toBeLessThan(100);
  });

  it("ingestSignal is idempotent for an already-revealed signal", async () => {
    const { useAgentStore } = await import("@/store/useAgentStore");
    const signal = seedSignals[0];
    useAgentStore.getState().ingestSignal(signal.id);
    useAgentStore.getState().ingestSignal(signal.id);

    expect(useAgentStore.getState().revealedSignalIds).toEqual([signal.id]);
  });

  it("resetAgentState returns to the empty pre-simulation state", async () => {
    const { useAgentStore } = await import("@/store/useAgentStore");
    useAgentStore.getState().ingestSignal(seedSignals[0].id);
    expect(useAgentStore.getState().analyses.length).toBeGreaterThan(0);

    useAgentStore.getState().resetAgentState();
    const state = useAgentStore.getState();
    expect(state.analyses).toHaveLength(0);
    expect(state.revealedSignalIds).toEqual([]);
    expect(state.health.overall).toBe(100);
  });
});
