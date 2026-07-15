import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk middleware — Part 2 of the auth work (see
 * pulsebuild_role_gated_approvals_handoff.txt for Part 1, mock
 * role-gated approvals). This replaces the mock "Acting as" dropdown's
 * source of truth: a real Clerk session now exists, and
 * store/useUIStore.ts's currentUser is synced from it via
 * components/auth/UserSync.tsx rather than being picked from a list.
 *
 * Sign-in/sign-up pages are public (obviously); everything else,
 * including the Command Center itself and /api/chat, requires a
 * signed-in session.
 */
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
