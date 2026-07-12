/**
 * Approval Rules
 * Source: Technical Architecture v1.0, Section 13 (Approval and
 * Verification Workflow) + SoT v2.0 Section 5 (Permission Rules) and
 * Section 9 (safety always Tier 1, never autonomous).
 */
import { ActionCategory } from "@/domain/types";
export type { ActionCategory };

export interface ApprovalRule {
  requiresApproval: boolean;
  /** True actions in this category can never be autonomous, even if
   * requiresApproval logic elsewhere would otherwise allow it. */
  neverAutonomous: boolean;
  reason: string;
}

export const APPROVAL_RULES: Record<ActionCategory, ApprovalRule> = {
  crew_reassignment: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Crew reassignment requires approval.",
  },
  inspection_reschedule: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Inspection rescheduling requires approval.",
  },
  permit_change: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Permit-related changes require approval.",
  },
  equipment_reassignment: {
    requiresApproval: true,
    neverAutonomous: false,
    reason:
      "Equipment reassignment affects other tasks' availability and requires approval.",
  },
  task_resequence: {
    requiresApproval: true,
    neverAutonomous: false,
    reason: "Resequencing work affects schedule commitments and requires approval.",
  },
  safety_review: {
    requiresApproval: true,
    neverAutonomous: true,
    reason: "Safety-related actions are never autonomous.",
  },
  notification_only: {
    requiresApproval: false,
    neverAutonomous: false,
    reason: "Notification-only actions may be automatic.",
  },
};
