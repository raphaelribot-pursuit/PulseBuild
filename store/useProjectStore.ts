import { create } from "zustand";
import {
  seedProject,
  seedPhases,
  seedTasks,
  seedCrews,
  seedMaterials,
  seedEquipment,
  seedInspections,
  seedPermits,
  seedWeather,
} from "@/data";
import {
  Project,
  Phase,
  Task,
  Crew,
  Material,
  Equipment,
  Inspection,
  Permit,
  WeatherEvent,
} from "@/domain/types";

/**
 * useProjectStore
 * Source: Technical Architecture v1.0, Section 9 — "project, tasks, crews,
 * materials, equipment, inspections, permits, weather."
 *
 * Phase 4/5 scope was read-only initialization from seed data. Phase 6
 * (Approval + Verification) adds the mutating actions the Architecture
 * doc lists — `applyCrewUpdates` / `applyEquipmentUpdates` /
 * `applyInspectionUpdates` — so the execution-simulation step (see
 * lib/executionSimulation.ts) has somewhere real to write its effects
 * before the Verification Engine reads project state back.
 */

export interface ProjectStoreState {
  project: Project;
  phases: Phase[];
  tasks: Task[];
  crews: Crew[];
  materials: Material[];
  equipment: Equipment[];
  inspections: Inspection[];
  permits: Permit[];
  weather: WeatherEvent[];

  applyCrewUpdates: (updated: Crew[]) => void;
  applyEquipmentUpdates: (updated: Equipment[]) => void;
  applyInspectionUpdates: (updated: Inspection[]) => void;
  /** Phase 8: rolls all entity state back to seed data. Closes the Phase
   * 6 known limitation where resetAgentState cleared signal/approval/
   * verification state but left entity mutations (e.g. a scheduled
   * inspection) in place. Called from useSimulationStore.resetSimulation
   * alongside resetAgentState so "Reset" is a true full reset. */
  resetToSeed: () => void;
}

function mergeById<T extends { id: string }>(list: T[], updated: T[]): T[] {
  if (updated.length === 0) return list;
  const byId = new Map(updated.map((u) => [u.id, u]));
  return list.map((item) => byId.get(item.id) ?? item);
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  project: seedProject,
  phases: seedPhases,
  tasks: seedTasks,
  crews: seedCrews,
  materials: seedMaterials,
  equipment: seedEquipment,
  inspections: seedInspections,
  permits: seedPermits,
  weather: seedWeather,

  applyCrewUpdates: (updated) =>
    set((state) => ({ crews: mergeById(state.crews, updated) })),
  applyEquipmentUpdates: (updated) =>
    set((state) => ({ equipment: mergeById(state.equipment, updated) })),
  applyInspectionUpdates: (updated) =>
    set((state) => ({ inspections: mergeById(state.inspections, updated) })),

  resetToSeed: () =>
    set({
      project: seedProject,
      phases: seedPhases,
      tasks: seedTasks,
      crews: seedCrews,
      materials: seedMaterials,
      equipment: seedEquipment,
      inspections: seedInspections,
      permits: seedPermits,
      weather: seedWeather,
    }),
}));
