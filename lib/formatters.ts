import { PriorityTier } from "@/domain/types";

/**
 * Formatters
 * Source: Technical Architecture v1.0, Section 3 (lib/formatters.ts) +
 * SoT v2.0 Section 15 (Design Tokens — "Reserve red for true blockers and
 * safety-related alerts only").
 */

export const TIER_COLOR_CLASS: Record<PriorityTier, string> = {
  Tier1: "bg-safety-red/15 text-safety-red border-safety-red/40",
  Tier2: "bg-warning-amber/15 text-warning-amber border-warning-amber/40",
  Tier3: "bg-white/10 text-muted-text border-white/20",
  Tier4: "bg-build-green/10 text-build-green border-build-green/30",
};

export const TIER_LABEL: Record<PriorityTier, string> = {
  Tier1: "Tier 1",
  Tier2: "Tier 2",
  Tier3: "Tier 3",
  Tier4: "Tier 4",
};

export function formatSignalType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatRelativeTime(isoString: string, nowIso: string): string {
  const now = new Date(nowIso).getTime();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60000);

  if (Math.abs(diffMin) < 1) return "just now";
  if (diffMin > 0) {
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
  }
  // Future timestamp (e.g. scheduled inspection).
  const futureMin = Math.abs(diffMin);
  if (futureMin < 60) return `in ${futureMin}m`;
  const futureHr = Math.round(futureMin / 60);
  if (futureHr < 24) return `in ${futureHr}h`;
  return `in ${Math.round(futureHr / 24)}d`;
}

/**
 * Formats an absolute timestamp with a FIXED locale and time zone.
 *
 * Round 1 fix (insufficient on its own): pinning locale to "en-US" and
 * timeZone to "UTC" stops the locale/timezone from resolving differently
 * server vs. client, but does NOT stop a second, subtler mismatch: when a
 * single `toLocaleString` call is given both date fields (month/day) and
 * time fields (hour/minute), the ICU implementation picks a "combined
 * pattern" to glue the date and time parts together — e.g. ", " vs " at ".
 * That glue character comes from the CLDR data version bundled with each
 * ICU build, which can differ between Node's server-side ICU and the
 * browser's V8 ICU even for the identical locale + timeZone + options.
 * That's what produced "Jul 8, 07:00 AM" (server) vs "Jul 8 at 07:00 AM"
 * (client) even after Round 1.
 *
 * Round 2 fix: never let Intl choose the date/time joiner. Format the
 * date portion and time portion with two separate calls (each one only
 * ever resolves a single-purpose pattern, not a combined one) and join
 * them with a literal separator we choose ourselves.
 */
export function formatAbsoluteTime(isoString: string): string {
  const date = new Date(isoString);
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${datePart}, ${timePart}`;
}

export function healthBandClass(score: number): string {
  if (score >= 85) return "text-build-green";
  if (score >= 65) return "text-warning-amber";
  return "text-safety-red";
}

export function driftLabelClass(
  label: "Normal" | "Warning" | "High Drift" | "Critical Drift"
): string {
  switch (label) {
    case "Normal":
      return "text-build-green";
    case "Warning":
      return "text-warning-amber";
    case "High Drift":
      return "text-warning-amber";
    case "Critical Drift":
      return "text-safety-red";
  }
}
