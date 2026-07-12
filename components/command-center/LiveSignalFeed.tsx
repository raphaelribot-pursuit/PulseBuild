"use client";

import { useMemo } from "react";
import { useAgentStore, selectLiveSignalFeed } from "@/store/useAgentStore";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  TIER_COLOR_CLASS,
  TIER_LABEL,
  formatSignalType,
  formatRelativeTime,
} from "@/lib/formatters";

/**
 * LiveSignalFeed
 * Source: SoT v2.0 Section 11 / 12 — newest signals first, priority
 * badges, every signal clickable, no hidden critical signals.
 * Phase 4: wired to real seeded + engine-classified signals. Click-through
 * to a full Signal Detail screen (SoT Section 11) is deferred — Phase 4
 * scope was "Live feed, health strip, recommendation queue, timeline"
 * using existing store data, not the detail screen.
 * Phase 5: signals only appear once the simulation engine ingests them,
 * so this now shows an empty state before Start Simulation is pressed —
 * per the Architecture Section 10 UI rule ("empty states should teach the
 * user what will happen when the simulation starts").
 */
export function LiveSignalFeed() {
  const analyses = useAgentStore((s) => s.analyses);
  const asOf = useAgentStore((s) => s.asOf);
  const signals = useMemo(() => selectLiveSignalFeed(analyses), [analyses]);

  if (signals.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Live Signal Feed</h2>
        <EmptyState
          title="No signals yet"
          description="Press Start Simulation to begin the scripted demo — new operational signals will appear here the moment they're detected, newest first."
        />
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <h2 className="text-sm font-semibold mb-3">Live Signal Feed</h2>
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
        {signals.map(({ signal, priority }) => (
          <div
            key={signal.id}
            className="border border-white/10 rounded-md px-3 py-2 flex items-start justify-between gap-3 hover:border-white/25 transition-colors animate-fade-in-up"
          >
            <div className="min-w-0">
              <p className="text-sm text-white/90 truncate">
                {formatSignalType(signal.type)}
              </p>
              <p className="text-xs text-muted-text truncate">
                {signal.relatedTaskId?.replace(/_/g, " ") ?? "No related task"} ·{" "}
                {signal.source}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={`text-[10px] font-data uppercase tracking-wide border rounded-full px-2 py-0.5 ${TIER_COLOR_CLASS[priority.tier]}`}
              >
                {TIER_LABEL[priority.tier]}
              </span>
              <span className="text-[10px] text-muted-text font-data">
                {formatRelativeTime(signal.createdAt, asOf)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
