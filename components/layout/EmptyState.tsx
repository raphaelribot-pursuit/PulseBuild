/**
 * EmptyState
 * Purpose: No active signals or no recommendations.
 * Source: SoT v2.0 Section 16 (Component Library)
 * Rule: "Empty states should teach the user what will happen when the
 * simulation starts." — Technical Architecture v1.0, Section 10 (UI rules)
 */
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-white/15 rounded-lg p-6 text-center">
      <p className="text-sm font-medium text-white/80">{title}</p>
      <p className="text-xs text-muted-text mt-1">{description}</p>
    </div>
  );
}
