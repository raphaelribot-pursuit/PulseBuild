import { Material } from "@/domain/types";

/**
 * Source: Architecture Section 6 — concrete, rebar, drywall, conduit,
 * fixtures. `mat_concrete` is deliberately "delayed" to drive the Tier 2
 * material-delay demo scenario (SoT Section 19).
 */
export const seedMaterials: Material[] = [
  {
    id: "mat_concrete",
    name: "Ready-Mix Concrete",
    deliveryStatus: "delayed",
    expectedDeliveryTime: "2026-07-08T13:00:00.000Z",
    quantityExpected: 40,
    quantityReceived: 0,
    relatedTaskIds: ["task_slab_pour"],
  },
  {
    id: "mat_rebar",
    name: "Rebar #4",
    deliveryStatus: "delivered",
    expectedDeliveryTime: "2026-07-01T09:00:00.000Z",
    quantityExpected: 500,
    quantityReceived: 500,
    relatedTaskIds: ["task_footings", "task_slab_pour"],
  },
  {
    id: "mat_drywall",
    name: "Drywall Sheets",
    deliveryStatus: "ordered",
    expectedDeliveryTime: "2026-10-12T09:00:00.000Z",
    quantityExpected: 300,
    quantityReceived: 0,
    relatedTaskIds: ["task_drywall_l1"],
  },
  {
    id: "mat_conduit",
    name: "Electrical Conduit",
    deliveryStatus: "in_transit",
    expectedDeliveryTime: "2026-07-14T09:00:00.000Z",
    quantityExpected: 200,
    quantityReceived: 0,
    relatedTaskIds: ["task_electrical_rough"],
  },
  {
    id: "mat_fixtures",
    name: "Light & Plumbing Fixtures",
    deliveryStatus: "ordered",
    expectedDeliveryTime: "2026-10-20T09:00:00.000Z",
    quantityExpected: 120,
    quantityReceived: 0,
    relatedTaskIds: ["task_fixtures"],
  },
];
