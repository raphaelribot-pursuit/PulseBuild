import { Inspection } from "@/domain/types";

/**
 * Source: Architecture Section 6 — slab, framing, electrical, safety
 * inspections. `insp_slab` is deliberately "not_scheduled" to drive the
 * Tier 1 inspection-missing-before-pour demo scenario (Architecture
 * Section 12, SoT Section 19).
 */
export const seedInspections: Inspection[] = [
  {
    id: "insp_slab",
    type: "Slab Inspection",
    status: "not_scheduled",
    requiredBeforeTaskId: "task_slab_pour",
  },
  {
    id: "insp_framing",
    type: "Framing Inspection",
    status: "scheduled",
    requiredBeforeTaskId: "task_electrical_rough",
    scheduledTime: "2026-08-25T09:00:00.000Z",
    inspectorName: "R. Alvarez",
  },
  {
    id: "insp_electrical",
    type: "Electrical Rough-in Inspection",
    status: "not_scheduled",
    requiredBeforeTaskId: "task_drywall_l1",
  },
  {
    id: "insp_safety",
    type: "Weekly Safety Walkthrough",
    status: "passed",
    requiredBeforeTaskId: "task_slab_pour",
    scheduledTime: "2026-07-07T08:00:00.000Z",
    inspectorName: "T. Nguyen",
  },
];
