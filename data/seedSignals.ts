import { ProjectSignal } from "@/domain/types";
import { DEMO_PROJECT_ID } from "@/domain/constants/demo";

/**
 * Source: Architecture Section 6 (10-15 scripted events) + Section 12
 * (required demo scenarios) + SoT Section 19 (required demo scenario
 * script) + Cognitive Spec Section 25 (signal lifecycle).
 *
 * These are seed/scripted signals for the simulation engine to play back
 * in Phase 5. Ordering here is the intended playback order. Statuses are
 * set to show the full lifecycle spread required for Phase 1-2 UI/testing
 * even before the simulation engine exists.
 *
 * Scenario coverage:
 *  - sig_03 (Tier 1, inspection missing before pour) + sig_02 (Tier 2,
 *    material delay) together drive the primary detect-react-verify loop
 *    and the "upgraded to Tier 1 when combined" priority rule (SoT
 *    Section 9).
 *  - sig_01 (Tier 2 weather alert) is the resolved verification path —
 *    demonstrates a full loop that closes successfully.
 *  - sig_05 (Tier 1 critical equipment failure) is the unresolved
 *    verification path — action partially fails, next-best action pending.
 */
export const seedSignals: ProjectSignal[] = [
  {
    id: "sig_01_weather_rain",
    projectId: DEMO_PROJECT_ID,
    type: "weather_alert",
    status: "resolved",
    createdAt: "2026-07-08T09:05:00.000Z",
    updatedAt: "2026-07-08T09:40:00.000Z",
    source: "simulation",
    relatedEntityId: "weather_rain_today",
    relatedTaskId: "task_steel_erection",
    severityHint: "Tier2",
    confidence: 0.93,
    rawData: {
      condition: "rain",
      severity: "moderate",
      note: "Resolved path: crew moved to indoor interior prep; outdoor work resumed after rain window closed.",
    },
  },
  {
    id: "sig_02_material_delay",
    projectId: DEMO_PROJECT_ID,
    type: "material_delivery_delayed",
    status: "recommendation_generated",
    createdAt: "2026-07-08T09:10:00.000Z",
    updatedAt: "2026-07-08T09:12:00.000Z",
    source: "simulation",
    relatedEntityId: "mat_concrete",
    relatedTaskId: "task_slab_pour",
    severityHint: "Tier2",
    confidence: 0.88,
    rawData: {
      material: "Ready-Mix Concrete",
      originalEta: "2026-07-08T13:00:00.000Z",
      revisedEta: "2026-07-09T08:00:00.000Z",
    },
  },
  {
    id: "sig_03_inspection_missing",
    projectId: DEMO_PROJECT_ID,
    type: "inspection_missing",
    status: "awaiting_approval",
    createdAt: "2026-07-08T09:15:00.000Z",
    updatedAt: "2026-07-08T09:20:00.000Z",
    source: "simulation",
    relatedEntityId: "insp_slab",
    relatedTaskId: "task_slab_pour",
    severityHint: "Tier1",
    confidence: 0.97,
    rawData: {
      inspectionType: "Slab Inspection",
      note: "Combined with material delay on the same task, this upgrades overall attention per SoT Section 9 priority rule.",
    },
  },
  {
    id: "sig_04_crew_shortage",
    projectId: DEMO_PROJECT_ID,
    type: "crew_shortage",
    status: "recommendation_generated",
    createdAt: "2026-07-08T09:22:00.000Z",
    updatedAt: "2026-07-08T09:25:00.000Z",
    source: "simulation",
    relatedEntityId: "crew_framing_b",
    relatedTaskId: "task_framing_l1",
    severityHint: "Tier2",
    confidence: 0.81,
    rawData: {
      requiredWorkers: 8,
      availableWorkers: 6,
    },
  },
  {
    id: "sig_05_equipment_failure",
    projectId: DEMO_PROJECT_ID,
    type: "critical_equipment_failure",
    status: "verification_pending",
    createdAt: "2026-07-08T09:30:00.000Z",
    updatedAt: "2026-07-08T10:05:00.000Z",
    source: "simulation",
    relatedEntityId: "equip_crane",
    relatedTaskId: "task_steel_erection",
    severityHint: "Tier1",
    confidence: 0.95,
    rawData: {
      equipment: "Tower Crane 1",
      note: "Unresolved path: backup crane rental fell through; task remains blocked pending next-best action.",
    },
  },
  {
    id: "sig_06_permit_pending",
    projectId: DEMO_PROJECT_ID,
    type: "permit_pending",
    status: "detected",
    createdAt: "2026-07-08T09:35:00.000Z",
    updatedAt: "2026-07-08T09:35:00.000Z",
    source: "simulation",
    relatedEntityId: "permit_occupancy",
    relatedTaskId: "task_occupancy",
    severityHint: "Tier3",
    confidence: 0.7,
    rawData: {
      permitType: "Occupancy Permit",
      note: "Low urgency — task is not scheduled to start for several months.",
    },
  },
  {
    id: "sig_07_task_behind",
    projectId: DEMO_PROJECT_ID,
    type: "task_behind_schedule",
    status: "validated",
    createdAt: "2026-07-08T09:40:00.000Z",
    updatedAt: "2026-07-08T09:42:00.000Z",
    source: "simulation",
    relatedEntityId: "task_steel_erection",
    relatedTaskId: "task_steel_erection",
    severityHint: "Tier2",
    confidence: 0.76,
    rawData: {
      plannedProgressPct: 40,
      actualProgressPct: 22,
    },
  },
  {
    id: "sig_08_minor_delay",
    projectId: DEMO_PROJECT_ID,
    type: "minor_delay",
    status: "detected",
    createdAt: "2026-07-08T09:45:00.000Z",
    updatedAt: "2026-07-08T09:45:00.000Z",
    source: "simulation",
    relatedEntityId: "mat_drywall",
    relatedTaskId: "task_drywall_l1",
    severityHint: "Tier3",
    confidence: 0.6,
    rawData: {
      note: "Supplier confirmed a 2-day cushion still exists before this affects the schedule.",
    },
  },
  {
    id: "sig_09_footings_complete",
    projectId: DEMO_PROJECT_ID,
    type: "task_complete",
    status: "archived",
    createdAt: "2026-05-14T16:30:00.000Z",
    updatedAt: "2026-05-14T17:00:00.000Z",
    source: "simulation",
    relatedEntityId: "task_footings",
    relatedTaskId: "task_footings",
    severityHint: "Tier4",
    confidence: 1,
    rawData: {},
  },
  {
    id: "sig_10_rebar_received",
    projectId: DEMO_PROJECT_ID,
    type: "delivery_received",
    status: "archived",
    createdAt: "2026-07-01T09:10:00.000Z",
    updatedAt: "2026-07-01T09:15:00.000Z",
    source: "simulation",
    relatedEntityId: "mat_rebar",
    relatedTaskId: "task_slab_pour",
    severityHint: "Tier4",
    confidence: 1,
    rawData: {
      quantityReceived: 500,
    },
  },
  {
    id: "sig_11_safety_walkthrough_passed",
    projectId: DEMO_PROJECT_ID,
    type: "task_complete",
    status: "archived",
    createdAt: "2026-07-07T08:30:00.000Z",
    updatedAt: "2026-07-07T08:45:00.000Z",
    source: "simulation",
    relatedEntityId: "insp_safety",
    relatedTaskId: "task_slab_pour",
    severityHint: "Tier4",
    confidence: 1,
    rawData: {
      inspector: "T. Nguyen",
    },
  },
  {
    id: "sig_12_interior_prep_reassignment",
    projectId: DEMO_PROJECT_ID,
    type: "task_behind_schedule",
    status: "action_taken",
    createdAt: "2026-07-08T09:50:00.000Z",
    updatedAt: "2026-07-08T09:55:00.000Z",
    source: "user",
    relatedEntityId: "crew_interior_e",
    relatedTaskId: "task_interior_prep",
    severityHint: "Tier2",
    confidence: 0.85,
    rawData: {
      note: "User-approved crew reassignment to interior prep while weather and material issues are resolved.",
    },
  },
];
