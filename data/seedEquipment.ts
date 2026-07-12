import { Equipment } from "@/domain/types";

/**
 * Source: Architecture Section 6 — crane, lift, excavator, pump truck.
 * `equip_crane` is deliberately "down" to drive the critical equipment
 * failure demo scenario (Architecture Section 12).
 */
export const seedEquipment: Equipment[] = [
  {
    id: "equip_crane",
    name: "Tower Crane 1",
    status: "down",
    assignedTaskId: "task_steel_erection",
    availableFrom: "2026-07-10T08:00:00.000Z",
    requiredForTaskIds: ["task_steel_erection", "task_framing_l2"],
  },
  {
    id: "equip_lift",
    name: "Scissor Lift",
    status: "available",
    availableFrom: "2026-07-08T07:00:00.000Z",
    requiredForTaskIds: ["task_framing_l1", "task_interior_prep"],
  },
  {
    id: "equip_excavator",
    name: "Excavator",
    status: "available",
    availableFrom: "2026-07-08T07:00:00.000Z",
    requiredForTaskIds: [],
  },
  {
    id: "equip_pump_truck",
    name: "Concrete Pump Truck",
    status: "reserved",
    assignedTaskId: "task_slab_pour",
    availableFrom: "2026-07-08T12:00:00.000Z",
    requiredForTaskIds: ["task_slab_pour"],
  },
];
