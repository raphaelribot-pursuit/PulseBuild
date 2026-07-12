"use client";

import { useAgentStore } from "@/store/useAgentStore";
import { TIER_COLOR_CLASS, TIER_LABEL, formatSignalType } from "@/lib/formatters";

/**
 * TopBlockerBanner
 * Source: SoT v2.0 Section 1 — "Show the highest priority operational
 * blocker within five seconds of opening the app." This is listed as a
 * non-negotiable product requirement, not just a chat feature, so it gets
 * its own prominent banner rather than waiting on the Phase 7 chat layer.
 */
export function TopBlockerBanner() {
  const topBlocker = useAgentStore((s) => s.topBlocker);

  if (!topBlocker) {
    return (
      <div className="rounded-lg border border-build-green/30 bg-build-green/10 px-4 py-3">
        <p className="text-sm font-medium text-build-green">
          No active blockers — all signals resolved or monitoring only.
        </p>
      </div>
    );
  }

  const { signal, priority, recommendation } = topBlocker;
  const tierClass = TIER_COLOR_CLASS[priority.tier];

  return (
    <div
      className={`rounded-lg border px-4 py-3 flex items-start justify-between gap-4 animate-fade-in-up ${tierClass} ${
        priority.tier === "Tier1" ? "animate-tier1-glow" : ""
      }`}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-data uppercase tracking-wide border rounded-full px-2 py-0.5">
            {TIER_LABEL[priority.tier]}
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-text font-data">
            Top Blocker
          </span>
        </div>
        <p className="text-sm font-semibold text-white">
          {formatSignalType(signal.type)}
          {signal.relatedTaskId ? ` — ${signal.relatedTaskId.replace(/_/g, " ")}` : ""}
        </p>
        {recommendation && (
          <p className="text-xs text-white/70 mt-1">{recommendation.action}</p>
        )}
      </div>
    </div>
  );
}
