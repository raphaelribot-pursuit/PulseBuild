/**
 * Approval Rules
 * Source: Technical Architecture v1.0, Section 13 (Approval and
 * Verification Workflow) + SoT v2.0 Section 5 (Permission Rules) and
 * Section 9 (safety always Tier 1, never autonomous).
 */
import { ActionCategory, UserRole } from "@/domain/types";
export type { ActionCategory };

export interface ApprovalRule {
  requiresApproval: boolean;
  /** True actions in this category can never be autonomous, even if
   * requiresApproval logic elsewhere would otherwise allow it. */
  neverAutonomous: boolean;
  reason: string;
  /** Mock-role gate (MVP scope — no enterprise permission system).
   * Roles not listed here cannot approve/reject this category; the UI
   * shows the recommendation read-only with `reason` as the callout.
   * Ignored for categories where requiresApproval is false, since
   * nobody needs to approve those. */
  allowedRoles: UserRole[];
}

const ALL_ROLES: UserRole[] = ["superintendent", "pm", "foreman", "safety_lead"];

export const APPROVAL_RULES: Record<ActionCategory, ApprovalRule> = {
  crew_reassignment: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Crew reassignment requires approval.",
    allowedRoles: ["superintendent", "pm", "foreman"],
  },
  inspection_reschedule: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Inspection rescheduling requires approval.",
    allowedRoles: ["superintendent", "pm"],
  },
  permit_change: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Permit-related changes require approval.",
    allowedRoles: ["pm"],
  },
  equipment_reassignment: {
    requiresApproval: true,
    neverAutonomous: false,
    reason:
      "Equipment reassignment affects other tasks' availability and requires approval.",
    allowedRoles: ["superintendent", "pm"],
  },
  task_resequence: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Resequencing work affects schedule commitments and requires approval.",
    allowedRoles: ["superintendent", "pm"],
  },
  safety_review: {
    requiresApproval: true,
    neverAutonomous: true,
    reason: "Safety-related actions are never autonomous.",
    allowedRoles: ["superintendent", "safety_lead"],
  },
  notification_only: {
    requiresApproval: false,
    neverAutonomous: false,
    reason: "Notification-only actions may be automatic.",
    allowedRoles: ALL_ROLES,
  },
};

/** Returns whether `role` may approve/reject a Recommendation whose
 * actionCategory is `category`. Categories with requiresApproval=false
 * always return true (nothing to gate). */
export function canRoleApprove(category: ActionCategory, role: UserRole): boolean {
  const rule = APPROVAL_RULES[category];
  if (!rule.requiresApproval) return true;
  return rule.allowedRoles.includes(role);
}
