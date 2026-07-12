/**
 * PulseBuild Entity Types (seeded data shapes)
 * Source: PulseBuild Source of Truth v2.0, Section 18 (Conceptual Database
 * Schema) and Section 7 (Construction Operating Model).
 *
 * These are the "world" entities that tasks depend on. `Task` and the
 * signal/recommendation/engine types live in ./index.ts — this file only
 * covers the supporting entities referenced by required*Ids on Task.
 */

export interface Project {
  id: string;
  name: string;
  location: string;
  phase: string;
  startDate: string;
  targetDate: string;
  healthScore: number;
  driftScore: number;
  status: "active" | "paused" | "completed";
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  status: "planned" | "active" | "completed";
}

export type CrewStatus = "active" | "idle" | "blocked";

export interface Crew {
  id: string;
  name: string;
  trade: string;
  requiredWorkers: number;
  availableWorkers: number;
  currentTaskId?: string;
  status: CrewStatus;
}

export type MaterialDeliveryStatus =
  | "ordered"
  | "in_transit"
  | "delayed"
  | "delivered";

export interface Material {
  id: string;
  name: string;
  deliveryStatus: MaterialDeliveryStatus;
  expectedDeliveryTime: string;
  quantityExpected: number;
  quantityReceived: number;
  relatedTaskIds: string[];
}

export type EquipmentStatus = "available" | "in_use" | "down" | "reserved";

export interface Equipment {
  id: string;
  name: string;
  status: EquipmentStatus;
  assignedTaskId?: string;
  availableFrom: string;
  requiredForTaskIds: string[];
}

export type InspectionStatus =
  | "not_scheduled"
  | "scheduled"
  | "passed"
  | "failed";

export interface Inspection {
  id: string;
  type: string;
  status: InspectionStatus;
  requiredBeforeTaskId: string;
  scheduledTime?: string;
  inspectorName?: string;
}

export type PermitStatus = "pending" | "approved" | "denied" | "expired";

export interface Permit {
  id: string;
  type: string;
  status: PermitStatus;
  requiredForTaskId: string;
  expirationDate?: string;
}

export type WeatherSeverity = "low" | "moderate" | "high";

export interface WeatherEvent {
  id: string;
  timestamp: string;
  condition: "rain" | "wind" | "heat" | "storm" | "clear";
  severity: WeatherSeverity;
  affectedTaskTypes: string[];
  startTime: string;
  endTime: string;
}
