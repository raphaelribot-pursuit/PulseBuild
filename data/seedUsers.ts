import { User } from "@/domain/types";

/**
 * Mock users — MVP has no real authentication (SoT v2.0: "Production
 * authentication and enterprise permissions" is explicitly deferred).
 * This is a fixed roster standing in for a real user directory. A real
 * auth provider (Clerk/NextAuth) later replaces `useUIStore.currentUser`
 * with the logged-in session's user — nothing else in the approval
 * pipeline needs to change, since it only ever reads `.role`.
 */
export const seedUsers: User[] = [
  { id: "user_super_1", name: "Dana Reyes", role: "superintendent" },
  { id: "user_pm_1", name: "Marcus Chen", role: "pm" },
  { id: "user_foreman_1", name: "Ellis Ward", role: "foreman" },
  { id: "user_safety_1", name: "Priya Nair", role: "safety_lead" },
];

export const DEFAULT_USER_ID = seedUsers[0].id;
