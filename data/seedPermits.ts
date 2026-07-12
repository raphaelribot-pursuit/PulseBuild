import { Permit } from "@/domain/types";

/**
 * Source: Architecture Section 6 — electrical, road closure,
 * occupancy-related permits.
 */
export const seedPermits: Permit[] = [
  {
    id: "permit_electrical",
    type: "Electrical Permit",
    status: "approved",
    requiredForTaskId: "task_electrical_rough",
    expirationDate: "2027-01-01T00:00:00.000Z",
  },
  {
    id: "permit_road_closure",
    type: "Road Closure Permit",
    status: "approved",
    requiredForTaskId: "task_excavation",
    expirationDate: "2026-04-15T00:00:00.000Z",
  },
  {
    id: "permit_occupancy",
    type: "Occupancy Permit",
    status: "pending",
    requiredForTaskId: "task_occupancy",
  },
];
