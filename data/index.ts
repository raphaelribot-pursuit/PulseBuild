/**
 * Single import point for all seeded MVP data.
 * Source: Technical Architecture v1.0, Section 3 (data/ folder ownership —
 * "Seed data should be typed and reusable").
 */
export { seedProject } from "./seedProject";
export { seedPhases } from "./seedPhases";
export { seedTasks } from "./seedTasks";
export { seedCrews } from "./seedCrews";
export { seedMaterials } from "./seedMaterials";
export { seedEquipment } from "./seedEquipment";
export { seedInspections } from "./seedInspections";
export { seedPermits } from "./seedPermits";
export { seedWeather } from "./seedWeather";
export { seedSignals } from "./seedSignals";
export { seedUsers, DEFAULT_USER_ID } from "./seedUsers";
