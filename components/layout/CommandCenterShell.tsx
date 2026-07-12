import { ReactNode } from "react";

/**
 * CommandCenterShell
 * Purpose: Overall application frame.
 * Source: PulseBuild Source of Truth v2.0, Section 16 (Component Library)
 *
 * Phase 8 note: the SoT's "desktop sidebar / tablet compact rail / mobile
 * bottom nav" variants describe navigation between multiple screens —
 * this MVP is a single Command Center screen with no other pages to
 * navigate to, so a distinct nav-per-breakpoint would be building UI for
 * a navigation problem that doesn't exist yet. What's actually needed —
 * the page content reflowing sensibly on narrow screens — is handled via
 * responsive Tailwind classes directly in CommandTopBar.tsx and
 * app/page.tsx (stacking, wrapping, tighter spacing below `sm`/`lg`)
 * rather than a separate shell variant.
 */
export function CommandCenterShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-command-navy text-foreground flex flex-col">
      {children}
    </div>
  );
}
