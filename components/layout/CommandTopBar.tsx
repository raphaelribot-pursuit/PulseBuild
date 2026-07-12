"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { useAgentStore } from "@/store/useAgentStore";
import { useSimulationStore, SimulationStatus } from "@/store/useSimulationStore";
import { formatAbsoluteTime } from "@/lib/formatters";
import { unlockAudio } from "@/lib/cloudVoiceAdapter";

/**
 * CommandTopBar
 * Purpose: Project context and simulation controls.
 * Source: SoT v2.0 Section 11 (Command Center screen spec) + Section 16
 * (Component Library).
 * States: idle, running, paused, completed — Phase 5 wires all four to
 * the real simulation engine (store/useSimulationStore.ts).
 */

const STATUS_LABEL: Record<SimulationStatus, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
};

const STATUS_DOT_CLASS: Record<SimulationStatus, string> = {
  idle: "bg-muted-text",
  running: "bg-signal-cyan animate-pulse",
  paused: "bg-warning-amber",
  completed: "bg-build-green",
};

export function CommandTopBar() {
  const project = useProjectStore((s) => s.project);
  const asOf = useAgentStore((s) => s.asOf);

  const status = useSimulationStore((s) => s.status);
  const startSimulation = useSimulationStore((s) => s.startSimulation);
  const pauseSimulation = useSimulationStore((s) => s.pauseSimulation);
  const resetSimulation = useSimulationStore((s) => s.resetSimulation);

  return (
    <header className="border-b border-white/10 bg-command-navy/95 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="text-sm text-muted-text font-data uppercase tracking-wide">
          {project.phase} Phase
        </p>
        <h1 className="text-lg font-semibold">{project.name}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <span className="text-xs font-data text-muted-text uppercase tracking-wide">
          As of {formatAbsoluteTime(asOf)} UTC
        </span>

        <span className="text-xs font-data text-muted-text uppercase tracking-wide px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[status]}`} />
          Simulation: {STATUS_LABEL[status]}
        </span>

        {status === "running" ? (
          <button
            onClick={pauseSimulation}
            className="text-sm font-medium px-4 py-2 rounded-md bg-warning-amber/20 text-warning-amber hover:bg-warning-amber/30 transition-colors"
          >
            Pause Simulation
          </button>
        ) : status === "completed" ? (
          <span className="text-xs text-muted-text font-data uppercase tracking-wide">
            Demo complete — press Reset to play again
          </span>
        ) : (
          <button
            onClick={() => {
              unlockAudio(); // real user gesture — unlocks <audio> playback for later timer-driven alerts
              startSimulation();
            }}
            className="text-sm font-medium px-4 py-2 rounded-md bg-steel-blue text-white hover:bg-steel-blue/80 transition-colors"
          >
            {status === "paused" ? "Resume Simulation" : "Start Simulation"}
          </button>
        )}

        {status !== "idle" && (
          <button
            onClick={resetSimulation}
            className="text-sm font-medium px-4 py-2 rounded-md border border-white/15 text-white/70 hover:bg-white/5 transition-colors"
            title="Reset project state to initial seed"
          >
            Reset
          </button>
        )}
      </div>
    </header>
  );
}
