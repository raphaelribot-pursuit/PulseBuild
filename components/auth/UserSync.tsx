"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useUIStore } from "@/store/useUIStore";
import { UserRole } from "@/domain/types";

const VALID_ROLES: UserRole[] = ["superintendent", "pm", "foreman", "safety_lead"];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (VALID_ROLES as string[]).includes(value);
}

/**
 * UserSync — the seam between real Clerk auth and the existing
 * role-gated approval system (domain/rules/approvalRules.ts,
 * store/useAgentStore.ts). Mounted once in app/layout.tsx.
 *
 * Reads the signed-in Clerk user and their `publicMetadata.role` (set
 * in the Clerk dashboard per-user — see the auth handoff doc for setup
 * steps) and pushes it into useUIStore.currentUser via setCurrentUser.
 * Everything downstream — canRoleApprove(), approveRecommendation(),
 * RecommendationQueue's read-only callout — was already written to only
 * read `.role`/`.id` off currentUser, so this is the only file that
 * needed to know Clerk exists.
 *
 * Renders nothing. If publicMetadata.role is missing or invalid, logs a
 * warning and leaves currentUser at its default rather than silently
 * granting/denying the wrong permissions — a misconfigured Clerk user
 * (role not set in the dashboard) should be loud, not silently broken.
 */
export function UserSync() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !user) return;

    const role = user.publicMetadata?.role;
    if (!isUserRole(role)) {
      console.warn(
        `UserSync: Clerk user ${user.id} has no valid publicMetadata.role set ` +
          `(got: ${JSON.stringify(role)}). Set it in the Clerk dashboard under ` +
          `this user's Metadata tab. Falling back to the default demo role.`
      );
      return;
    }

    useUIStore.getState().setCurrentUser({
      id: user.id,
      name: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "Unknown user",
      role,
    });
  }, [isLoaded, user]);

  return null;
}
