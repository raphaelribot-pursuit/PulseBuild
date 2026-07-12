import { Crew } from "@/domain/types";

/**
 * Source: SoT v2.0 Section 7 (Crew example) — Architecture Section 6 seed
 * quality rule: 4-6 crews with trade, capacity, assigned tasks.
 */
export const seedCrews: Crew[] = [
  {
    id: "crew_concrete_a",
    name: "Concrete Crew A",
    trade: "Concrete",
    requiredWorkers: 6,
    availableWorkers: 6,
    currentTaskId: "task_slab_pour",
    status: "active",
  },
  {
    id: "crew_framing_b",
    name: "Framing Crew B",
    trade: "Framing",
    requiredWorkers: 8,
    availableWorkers: 6,
    currentTaskId: "task_framing_l1",
    status: "active",
  },
  {
    id: "crew_steel_c",
    name: "Steel Crew C",
    trade: "Steel Erection",
    requiredWorkers: 5,
    availableWorkers: 5,
    currentTaskId: "task_steel_erection",
    status: "active",
  },
  {
    id: "crew_electrical_d",
    name: "Electrical Crew D",
    trade: "Electrical",
    requiredWorkers: 4,
    availableWorkers: 4,
    status: "idle",
  },
  {
    id: "crew_interior_e",
    name: "Interior Prep Crew E",
    trade: "General / Interior",
    requiredWorkers: 4,
    availableWorkers: 4,
    currentTaskId: "task_interior_prep",
    status: "active",
  },
];
