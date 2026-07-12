"use client";

import { useAgentStore } from "@/store/useAgentStore";
import { EmptyState } from "@/components/layout/EmptyState";
import { TIER_COLOR_CLASS, formatRelativeTime } from "@/lib/formatters";

/**
 * TimelinePanel
 * Source: SoT v2.0 Section 11 — chronological signal, analysis, approval,
 * verification events. This is the permanent audit record.
 * Phase 4: wired to the real Audit Logger output (lib/auditLogger.ts),
 * grouped by signal in signal-creation order.
 * Phase 5: empty state added for the pre-simulation state (Component
 * Library, SoT Section 16, lists "no history" as an EmptyState variant).
 */
export function TimelinePanel() {
  const timeline = useAgentStore((s) => s.timeline);
  const asOf = useAgentStore((s) => s.asOf);

  if (timeline.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Timeline</h2>
        <EmptyState
          title="No history yet"
          description="Every signal, analysis, recommendation, approval, and verification will be logged here as soon as the simulation starts — a permanent audit trail."
        />
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <h2 className="text-sm font-semibold mb-3">
        Timeline <span className="text-muted-text font-normal">({timeline.length})</span>
      </h2>
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
        {timeline.map((event) => (
          <div
            key={event.id}
            className="border-l-2 border-white/10 pl-3 py-1 animate-fade-in-up"
            style={
              event.severity
                ? { borderLeftColor: "currentColor" }
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              {event.severity && (
                <span
                  className={`text-[9px] font-data uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${TIER_COLOR_CLASS[event.severity]}`}
                >
                  {event.severity}
                </span>
              )}
              <p className="text-xs font-medium text-white/85">{event.title}</p>
            </div>
            <p className="text-[11px] text-muted-text mt-0.5">{event.description}</p>
            <p className="text-[10px] text-muted-text/70 font-data mt-0.5">
              {formatRelativeTime(event.timestamp, asOf)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
