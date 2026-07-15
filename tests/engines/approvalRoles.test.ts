import { describe, it, expect, beforeEach } from "vitest";
import { APPROVAL_RULES, canRoleApprove } from "@/domain/rules/approvalRules";
import { useAgentStore } from "@/store/useAgentStore";
import { useUIStore } from "@/store/useUIStore";
import { seedUsers, DEFAULT_USER_ID } from "@/data";

const superintendent = seedUsers.find((u) => u.id === DEFAULT_USER_ID)!;
const foreman = seedUsers.find((u) => u.role === "foreman")!;
const pm = seedUsers.find((u) => u.role === "pm")!;
const safetyLead = seedUsers.find((u) => u.role === "safety_lead")!;

describe("canRoleApprove", () => {
  it("allows every role on notification_only (requiresApproval is false)", () => {
    for (const role of ["superintendent", "pm", "foreman", "safety_lead"] as const) {
      expect(canRoleApprove("notification_only", role)).toBe(true);
    }
  });

  it("restricts safety_review to superintendent and safety_lead only", () => {
    expect(canRoleApprove("safety_review", "superintendent")).toBe(true);
    expect(canRoleApprove("safety_review", "safety_lead")).toBe(true);
    expect(canRoleApprove("safety_review", "pm")).toBe(false);
    expect(canRoleApprove("safety_review", "foreman")).toBe(false);
  });

  it("restricts permit_change to pm only", () => {
    expect(canRoleApprove("permit_change", "pm")).toBe(true);
    expect(canRoleApprove("permit_change", "superintendent")).toBe(false);
    expect(canRoleApprove("permit_change", "foreman")).toBe(false);
    expect(canRoleApprove("permit_change", "safety_lead")).toBe(false);
  });

  it("allows foreman on crew_reassignment but not on other approval categories", () => {
    expect(canRoleApprove("crew_reassignment", "foreman")).toBe(true);
    expect(canRoleApprove("task_resequence", "foreman")).toBe(false);
    expect(canRoleApprove("equipment_reassignment", "foreman")).toBe(false);
    expect(canRoleApprove("inspection_reschedule", "foreman")).toBe(false);
  });

  it("every allowedRoles list in APPROVAL_RULES is non-empty for categories that require approval", () => {
    for (const [category, rule] of Object.entries(APPROVAL_RULES)) {
      if (rule.requiresApproval) {
        expect(rule.allowedRoles.length, `${category} has no allowed roles`).toBeGreaterThan(0);
      }
    }
  });
});

describe("useAgentStore role gate on approve/reject/tryAlternative", () => {
  beforeEach(() => {
    useAgentStore.getState().resetAgentState();
    useUIStore.setState({ currentUser: superintendent });
  });

  it("blocks approveRecommendation when the acting user's role isn't allowed for the category", () => {
    useUIStore.setState({ currentUser: foreman });
    useAgentStore.getState().ingestSignal("sig_05_equipment_failure");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_05_equipment_failure");
    const recId = analysis!.recommendation!.id;
    expect(analysis!.recommendation!.actionCategory).toBe("equipment_reassignment");

    useAgentStore.getState().approveRecommendation(recId);

    // Foreman isn't in equipment_reassignment's allowedRoles — no
    // approval should have been recorded.
    expect(useAgentStore.getState().approvals[recId]).toBeUndefined();
  });

  it("allows approveRecommendation once the acting user has an allowed role", () => {
    useUIStore.setState({ currentUser: pm });
    useAgentStore.getState().ingestSignal("sig_05_equipment_failure");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_05_equipment_failure");
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().approveRecommendation(recId);

    const approval = useAgentStore.getState().approvals[recId];
    expect(approval.status).toBe("approved");
    expect(approval.decidedBy).toBe(pm.id);
  });

  it("stamps decidedBy with the real acting user's id, not a hardcoded placeholder", () => {
    useUIStore.setState({ currentUser: safetyLead });
    useAgentStore.getState().ingestSignal("sig_03_inspection_missing");
    // sig_03 is inspection_reschedule, which safety_lead cannot decide on
    // — switch to a role that can, to isolate the decidedBy assertion.
    useUIStore.setState({ currentUser: superintendent });
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_03_inspection_missing");
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().approveRecommendation(recId);

    expect(useAgentStore.getState().approvals[recId].decidedBy).toBe(superintendent.id);
  });

  it("blocks rejectRecommendation the same way approve is blocked", () => {
    useUIStore.setState({ currentUser: foreman });
    useAgentStore.getState().ingestSignal("sig_05_equipment_failure");
    const analysis = useAgentStore
      .getState()
      .analyses.find((a) => a.signal.id === "sig_05_equipment_failure");
    const recId = analysis!.recommendation!.id;

    useAgentStore.getState().rejectRecommendation(recId);

    expect(useAgentStore.getState().approvals[recId]).toBeUndefined();
  });

  it("safety_review still requires human approval regardless of role (guardrail preserved)", () => {
    // Even superintendent/safety_lead, who ARE allowed to decide, must
    // still go through explicit approval — neverAutonomous stays true.
    expect(APPROVAL_RULES.safety_review.neverAutonomous).toBe(true);
    expect(canRoleApprove("safety_review", "superintendent")).toBe(true);
    expect(canRoleApprove("safety_review", "safety_lead")).toBe(true);
  });
});
