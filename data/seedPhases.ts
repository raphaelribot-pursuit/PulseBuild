import { Phase } from "@/domain/types";
import { DEMO_PROJECT_ID } from "@/domain/constants/demo";

/**
 * Source: SoT v2.0 Section 7 — Phase = "Major work stage."
 * Kept minimal for MVP; Tasks reference these by phaseId.
 */
export const seedPhases: Phase[] = [
  {
    id: "phase_sitework",
    projectId: DEMO_PROJECT_ID,
    name: "Sitework",
    plannedStart: "2026-03-02T08:00:00.000Z",
    plannedEnd: "2026-04-10T17:00:00.000Z",
    status: "completed",
  },
  {
    id: "phase_structure",
    projectId: DEMO_PROJECT_ID,
    name: "Structure",
    plannedStart: "2026-04-13T08:00:00.000Z",
    plannedEnd: "2026-08-21T17:00:00.000Z",
    status: "active",
  },
  {
    id: "phase_mep",
    projectId: DEMO_PROJECT_ID,
    name: "MEP Rough-in",
    plannedStart: "2026-07-06T08:00:00.000Z",
    plannedEnd: "2026-10-16T17:00:00.000Z",
    status: "planned",
  },
  {
    id: "phase_finishes",
    projectId: DEMO_PROJECT_ID,
    name: "Finishes",
    plannedStart: "2026-10-19T08:00:00.000Z",
    plannedEnd: "2027-01-22T17:00:00.000Z",
    status: "planned",
  },
];
