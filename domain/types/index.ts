/**
 * PulseBuild Domain Types
 * Source: PulseBuild Technical Architecture v1.0, Section 5
 *         PulseBuild Cognitive & Reasoning Specification, Sections 4, 22, 25
 *
 * These interfaces define the shared language of the system. Engines, the
 * agent orchestrator, the store, and the UI must all speak in these types.
 * Do not let components or the LLM invent shapes outside this file.
 */

// ---------------------------------------------------------------------------
// Priority & Signal
// ---------------------------------------------------------------------------

export type PriorityTier = "Tier1" | "Tier2" | "Tier3" | "Tier4";

export type SignalStatus =
  | "detected"
  | "validated"
  | "prioritized"
  | "recommendation_generated"
  | "awaiting_approval"
  | "action_taken"
  | "verification_pending"
  | "resolved"
  | "archived";

export type SignalType =
  | "safety_incident"
  | "inspection_failed"
  | "inspection_missing"
  | "critical_equipment_failure"
  | "material_delivery_delayed"
  | "crew_shortage"
  | "weather_alert"
  | "permit_pending"
  | "task_behind_schedule"
  | "minor_delay"
  | "task_complete"
  | "delivery_received";

export interface ProjectSignal {
  id: string;
  projectId: string;
  type: SignalType;
  status: SignalStatus;
  createdAt: string;
  updatedAt: string;
  source: "simulation" | "user" | "system";
  relatedEntityId?: string;
  relatedTaskId?: string;
  severityHint?: PriorityTier;
  confidence: number;
  rawData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Task / Project State Machine (Cognitive Spec, Section 24)
// ---------------------------------------------------------------------------

export type TaskState =
  | "planned"
  | "ready"
  | "waiting"
  | "blocked"
  | "executing"
  | "paused"
  | "completed"
  | "verified"
  | "closed";

export interface Task {
  id: string;
  projectId: string;
  phaseId: string;
  name: string;
  status: TaskState;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  dependencies: string[];
  requiredCrewIds: string[];
  requiredMaterialIds: string[];
  requiredEquipmentIds: string[];
  requiredInspectionIds: string[];
  priorityWeight?: number;
}

// ---------------------------------------------------------------------------
// Engine result envelope
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  label: string;
  detail: string;
  sourceEntityId?: string;
}

export interface EngineResult<T> {
  ok: boolean;
  data: T;
  warnings: string[];
  confidence: number;
  evidence: EvidenceItem[];
}

// ---------------------------------------------------------------------------
// Operational Intent (Cognitive Spec, Section 22)
// ---------------------------------------------------------------------------

export type OperationalIntent =
  | "protect_safety"
  | "protect_critical_path"
  | "restore_productivity"
  | "restore_material_flow"
  | "restore_crew_flow"
  | "protect_budget"
  | "protect_quality"
  | "maintain_compliance";

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

/** Source: Technical Architecture v1.0, Section 13 (Approval Rules) +
 * domain/rules/approvalRules.ts. Lives here (not in domain/rules) so that
 * Recommendation can carry it without domain/types depending on
 * domain/rules — approvalRules.ts imports this type instead of declaring
 * its own copy. */
export type ActionCategory =
  | "crew_reassignment"
  | "inspection_reschedule"
  | "permit_change"
  | "equipment_reassignment"
  | "task_resequence"
  | "safety_review"
  | "notification_only";

export interface VerificationPlan {
  checks: string[];
  expectedSignal: string;
}

export interface RecommendationAlternative {
  action: string;
  rationale: string;
  score: number;
  /** Phase 8: lets "Try Alternative" run this option through the same
   * Approval -> Execution Simulation -> Verification pipeline as the
   * primary action, instead of only ever displaying it as text. */
  actionCategory: ActionCategory;
}

export interface Recommendation {
  id: string;
  signalId: string;
  intent: OperationalIntent;
  secondaryIntents?: OperationalIntent[];
  /** Drives Approval Engine lookup into APPROVAL_RULES (Architecture
   * Section 13) and Verification Engine's feasibility check (Phase 6). */
  actionCategory: ActionCategory;
  action: string;
  rationale: string;
  expectedBenefit: string;
  tradeoffs: string[];
  confidence: number;
  requiresApproval: boolean;
  approvalReason?: string;
  verificationPlan: VerificationPlan;
  alternatives: RecommendationAlternative[];
}

// ---------------------------------------------------------------------------
// Approval / Verification
// ---------------------------------------------------------------------------

export type ApprovalStatus =
  | "autonomous"
  | "approval_required"
  | "approved"
  | "rejected"
  | "blocked_safety";

export interface ApprovalResult {
  status: ApprovalStatus;
  reason: string;
  decidedAt?: string;
  decidedBy?: string;
}

export type VerificationOutcome =
  | "resolved"
  | "partially_resolved"
  | "unresolved";

export interface VerificationResult {
  outcome: VerificationOutcome;
  checkedAt: string;
  resultSummary: string;
  nextBestAction?: string;
}

// ---------------------------------------------------------------------------
// Timeline / Audit
// ---------------------------------------------------------------------------

export type TimelineEventType =
  | "signal.detected"
  | "signal.prioritized"
  | "dependency.resolved"
  | "recommendation.created"
  | "approval.required"
  | "approval.approved"
  | "approval.rejected"
  | "verification.completed"
  | "health.updated"
  | "drift.updated";

export interface TimelineEvent {
  id: string;
  projectId: string;
  type: TimelineEventType;
  timestamp: string;
  title: string;
  description: string;
  relatedSignalId?: string;
  relatedRecommendationId?: string;
  severity?: PriorityTier;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Agent Decision (Architecture Section 8)
// ---------------------------------------------------------------------------

export interface PriorityOutput {
  tier: PriorityTier;
  attentionScore: number;
  explanation: string;
}

export interface DependencyOutput {
  affectedTaskIds: string[];
  affectedCrewIds: string[];
  affectedMilestoneIds: string[];
  cascadeDepth: number;
  criticalPathImpact: boolean;
}

export interface PredictionOutput {
  estimatedDelayHours: number;
  idleLaborRisk: boolean;
  cascadeDepth: number;
  healthImpact: number;
  driftImpact: number;
  recoveryDurationHours?: number;
}

export interface AgentExplanation {
  situation: string;
  priority: string;
  evidence: string[];
  impact: string;
  recommendation: string;
  confidence: string;
  approval: string;
  verification: string;
}

export interface AgentDecision {
  signal: ProjectSignal;
  priority: PriorityOutput;
  dependencies: DependencyOutput;
  prediction: PredictionOutput;
  recommendation: Recommendation;
  approval: ApprovalResult;
  explanation: AgentExplanation;
  auditEvents: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Health & Drift (Source of Truth Section 10)
// ---------------------------------------------------------------------------

export interface HealthDomainScore {
  domain:
    | "productivity"
    | "schedule"
    | "resource"
    | "material"
    | "equipment"
    | "safety"
    | "quality"
    | "communication"
    | "inspection";
  score: number;
  trend: "up" | "down" | "flat";
  confidence: number;
  primaryRisk?: string;
  recommendedRecovery?: string;
}

export interface HealthState {
  overall: number;
  domains: HealthDomainScore[];
  updatedAt: string;
}

export interface DriftState {
  score: number;
  label: "Normal" | "Warning" | "High Drift" | "Critical Drift";
  causes: string[];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Re-export supporting entity types (Project, Crew, Material, Equipment,
// Inspection, Permit, WeatherEvent) so consumers can `import { ... } from
// "@/domain/types"` for everything in one place.
// ---------------------------------------------------------------------------
export * from "./entities";
