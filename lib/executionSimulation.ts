import { ActionCategory, Crew, Equipment, Inspection } from "@/domain/types";

/**
 * Execution Simulation
 * Source: Technical Architecture v1.0, Section 4 (runtime pipeline —
 * "Execution Simulation" sits between Approval Engine and Verification
 * Engine) and Section 13 ("Execution simulation" box in the workflow
 * diagram).
 *
 * This is deliberately NOT a new "outcome per signal" script. It answers
 * one grounded, generalizable question — "given the project's *current*
 * crew/equipment/inspection data, is this specific action category
 * actually achievable right now?" — by reading real entity state, the
 * same seed data every other engine reads. No new seed fields, no
 * per-signal-id branching.
 *
 * Feasibility rule per action category:
 *  - crew_reassignment / task_resequence: always feasible. Moving a crew
 *    to other prep work or resequencing the schedule doesn't depend on
 *    anything external — it mitigates the immediate side effect (idle
 *    labor) but does NOT fix whatever caused the signal (material still
 *    delayed, weather still bad). Verification Engine treats this
 *    category as a mitigation, not a root-cause fix.
 *  - inspection_reschedule: feasible if the inspection isn't already
 *    passed — scheduling one is always something we can do.
 *  - equipment_reassignment: feasible only if another equipment item
 *    (not the broken one) is genuinely `available` right now. If every
 *    other unit is `in_use`, `down`, or `reserved`, there is no real
 *    backup — this is what makes the seeded crane-failure scenario
 *    unresolved: no other seeded equipment is available to reassign.
 *  - permit_change: never feasible from inside this system — permits are
 *    an external agency's timeline. We can only notify/expedite.
 *  - safety_review: feasible — the always-available action is stopping
 *    automated work and routing to a human, which this system can always
 *    do.
 *  - notification_only: trivially feasible.
 */

export interface ExecutionEffect {
  feasible: boolean;
  note: string;
  /** Entity updates to apply back to useProjectStore, if any. */
  updatedCrews?: Crew[];
  updatedEquipment?: Equipment[];
  updatedInspections?: Inspection[];
}

export interface ExecutionSimulationInput {
  actionCategory: ActionCategory;
  relatedTaskId?: string;
  relatedEntityId?: string;
  crews: Crew[];
  equipment: Equipment[];
  inspections: Inspection[];
}

export function runExecutionSimulation(
  input: ExecutionSimulationInput
): ExecutionEffect {
  const { actionCategory, relatedTaskId, relatedEntityId, crews, equipment, inspections } =
    input;

  switch (actionCategory) {
    case "crew_reassignment":
    case "task_resequence": {
      const involved = crews.filter((c) => c.currentTaskId === relatedTaskId);
      const updatedCrews = involved.map((c) => ({ ...c, status: "active" as const }));
      return {
        feasible: true,
        note:
          updatedCrews.length > 0
            ? `${updatedCrews.map((c) => c.name).join(", ")} reassigned to available work.`
            : "Schedule resequenced around the affected task.",
        updatedCrews: updatedCrews.length > 0 ? updatedCrews : undefined,
      };
    }

    case "inspection_reschedule": {
      const target = inspections.find((i) => i.requiredBeforeTaskId === relatedTaskId);
      if (!target || target.status === "passed") {
        return { feasible: true, note: "Inspection already satisfied." };
      }
      const updated: Inspection = { ...target, status: "scheduled" };
      return {
        feasible: true,
        note: `${target.type} inspection scheduled.`,
        updatedInspections: [updated],
      };
    }

    case "equipment_reassignment": {
      const broken = equipment.find((e) => e.id === relatedEntityId);
      // A genuine backup must be (a) actually available and (b) already
      // qualified for this specific task — i.e. its own requiredForTaskIds
      // lists the affected task. This is what stops, say, an idle
      // excavator or scissor lift from being treated as a substitute for
      // a down tower crane: neither lists the crane's task as one they
      // can cover, so there is no real backup and the check correctly
      // fails. Reading real seed data, not a hardcoded per-signal branch.
      const backup = equipment.find(
        (e) =>
          e.id !== relatedEntityId &&
          e.status === "available" &&
          Boolean(relatedTaskId) &&
          e.requiredForTaskIds.includes(relatedTaskId as string)
      );
      if (!backup) {
        return {
          feasible: false,
          note: broken
            ? `No qualified backup equipment available for this task — other idle units aren't rated for it. ${broken.name} remains down.`
            : "No backup equipment available.",
        };
      }
      const updatedEquipment: Equipment[] = [
        { ...backup, status: "reserved", assignedTaskId: relatedTaskId },
      ];
      return {
        feasible: true,
        note: `${backup.name} reassigned to cover the affected task.`,
        updatedEquipment,
      };
    }

    case "permit_change":
      return {
        feasible: false,
        note: "Permit status depends on an external agency; expedite request sent but not yet in our control.",
      };

    case "safety_review":
      return {
        feasible: true,
        note: "Work stopped and routed to human safety review.",
      };

    case "notification_only":
      return { feasible: true, note: "Notification sent." };

    default:
      return { feasible: false, note: "Unknown action category." };
  }
}
