"use client";

import { useState } from "react";
import { useAgentStore } from "@/store/useAgentStore";
import { healthBandClass, driftLabelClass } from "@/lib/formatters";

/**
 * HealthStrip
 * Source: SoT v2.0 Section 11 — Health Score, Drift Score, Tier 1 count,
 * unresolved actions, last update.
 * Phase 4: wired to the real Health/Drift Engine output via useAgentStore.
 * Phase 8: Health Score is now clickable, expanding the domain-by-domain
 * breakdown (Cognitive & Reasoning Spec Section 23 / HealthState.domains)
 * per the Architecture Section 10 UI rule "every score must have a
 * clickable explanation."
 */
export function HealthStrip() {
  const health = useAgentStore((s) => s.health);
  const drift = useAgentStore((s) => s.drift);
  const analyses = useAgentStore((s) => s.analyses);
  const [expanded, setExpanded] = useState(false);

  const activeAnalyses = analyses.filter(
    (a) => a.signal.status !== "resolved" && a.signal.status !== "archived"
  );
  const tier1Count = activeAnalyses.filter((a) => a.priority.tier === "Tier1").length;
  const unresolvedActions = activeAnalyses.filter(
    (a) => a.hasUnresolvedRecommendation
  ).length;

  const cards = [
    {
      label: "Drift Score",
      value: `${drift.score} · ${drift.label}`,
      valueClass: driftLabelClass(drift.label),
    },
    {
      label: "Tier 1 Count",
      value: tier1Count.toString(),
      valueClass: tier1Count > 0 ? "text-safety-red" : "text-white/70",
    },
    {
      label: "Unresolved Actions",
      value: unresolvedActions.toString(),
      valueClass: unresolvedActions > 0 ? "text-warning-amber" : "text-white/70",
    },
  ];

  // Only domains with at least a flat/known signal are worth surfacing —
  // "quality" and "communication" never have a seeded signal source (see
  // healthEngine.ts's DOMAIN_BY_SIGNAL_TYPE comment) and would just show
  // a flat 100 with no explanation, which isn't useful detail.
  const relevantDomains = health.domains.filter(
    (d) => d.primaryRisk !== undefined || d.trend !== "flat"
  );

  return (
    <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="text-left bg-white/[0.03] border border-white/10 rounded-lg p-4 hover:border-white/20 transition-colors sm:col-span-1"
        title="Click to see the domain-by-domain breakdown"
      >
        <p className="text-xs text-muted-text font-data uppercase tracking-wide flex items-center justify-between">
          Health Score
          <span className="text-muted-text/70">{expanded ? "▲" : "▼"}</span>
        </p>
        <p className={`text-2xl font-data mt-1 transition-colors ${healthBandClass(health.overall)}`}>
          {health.overall}
        </p>
      </button>

      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white/[0.03] border border-white/10 rounded-lg p-4"
        >
          <p className="text-xs text-muted-text font-data uppercase tracking-wide">
            {card.label}
          </p>
          <p className={`text-2xl font-data mt-1 transition-colors ${card.valueClass}`}>{card.value}</p>
        </div>
      ))}

      {expanded && (
        <div className="sm:col-span-4 bg-white/[0.03] border border-white/10 rounded-lg p-4 animate-fade-in-up">
          <p className="text-xs text-muted-text font-data uppercase tracking-wide mb-2">
            Health breakdown by domain
          </p>
          {relevantDomains.length === 0 ? (
            <p className="text-xs text-muted-text">
              Every domain is currently at full score — no active issues.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {relevantDomains.map((d) => (
                <div key={d.domain} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 capitalize">{d.domain}</span>
                    <span className={healthBandClass(d.score)}>{d.score}</span>
                  </div>
                  {d.primaryRisk && (
                    <p className="text-muted-text mt-0.5 truncate" title={d.primaryRisk}>
                      {d.primaryRisk}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
