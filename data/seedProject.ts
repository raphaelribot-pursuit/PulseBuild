import { Project } from "@/domain/types";
import { DEMO_PROJECT_ID } from "@/domain/constants/demo";

/**
 * Source: SoT v2.0 Section 7 (example entity) and Section 19 (Simulation
 * Engine — "Project starts healthy with Health Score above 90").
 */
export const seedProject: Project = {
  id: DEMO_PROJECT_ID,
  name: "Harbor Point Mixed-Use Build",
  location: "Harbor Point, WA",
  phase: "Structure",
  startDate: "2026-03-02T08:00:00.000Z",
  targetDate: "2027-01-30T17:00:00.000Z",
  healthScore: 94,
  driftScore: 6,
  status: "active",
};
