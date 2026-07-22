import { describe, it, expect } from "vitest";
import { assertValidTransition, TRANSITIONS } from "@/lib/workflow";
import { DocStatus, Role, AuditAction } from "@prisma/client";
import { WorkflowError, ForbiddenError } from "@/lib/errors";

describe("Workflow State Machine (lib/workflow.ts)", () => {
  it("should allow author to submit draft (DRAFT -> SUBMITTED)", () => {
    const t = assertValidTransition(DocStatus.DRAFT, DocStatus.SUBMITTED, Role.AUTHOR);
    expect(t.action).toBe(AuditAction.SUBMITTED);
  });

  it("should allow reviewer to approve submitted doc (SUBMITTED -> APPROVED)", () => {
    const t = assertValidTransition(DocStatus.SUBMITTED, DocStatus.APPROVED, Role.REVIEWER);
    expect(t.action).toBe(AuditAction.APPROVED);
  });

  it("should allow reviewer to reject submitted doc (SUBMITTED -> REJECTED)", () => {
    const t = assertValidTransition(DocStatus.SUBMITTED, DocStatus.REJECTED, Role.REVIEWER);
    expect(t.action).toBe(AuditAction.REJECTED);
  });

  it("should allow author to reopen rejected doc (REJECTED -> DRAFT)", () => {
    const t = assertValidTransition(DocStatus.REJECTED, DocStatus.DRAFT, Role.AUTHOR);
    expect(t.action).toBe(AuditAction.REOPENED);
  });

  it("should allow reviewer or admin to publish approved doc (APPROVED -> PUBLISHED)", () => {
    const tReviewer = assertValidTransition(DocStatus.APPROVED, DocStatus.PUBLISHED, Role.REVIEWER);
    expect(tReviewer.action).toBe(AuditAction.PUBLISHED);

    const tAdmin = assertValidTransition(DocStatus.APPROVED, DocStatus.PUBLISHED, Role.ADMIN);
    expect(tAdmin.action).toBe(AuditAction.PUBLISHED);
  });

  it("should allow admin to archive from any active status", () => {
    const statuses = [DocStatus.DRAFT, DocStatus.SUBMITTED, DocStatus.APPROVED, DocStatus.PUBLISHED];
    for (const status of statuses) {
      const t = assertValidTransition(status, DocStatus.ARCHIVED, Role.ADMIN);
      expect(t.action).toBe(AuditAction.ARCHIVED);
    }
  });

  it("should throw WorkflowError (400) on invalid state transitions", () => {
    // Cannot skip states
    expect(() => assertValidTransition(DocStatus.DRAFT, DocStatus.APPROVED, Role.AUTHOR)).toThrow(WorkflowError);
    expect(() => assertValidTransition(DocStatus.DRAFT, DocStatus.PUBLISHED, Role.ADMIN)).toThrow(WorkflowError);
    expect(() => assertValidTransition(DocStatus.SUBMITTED, DocStatus.PUBLISHED, Role.REVIEWER)).toThrow(WorkflowError);
    // Cannot transition from terminal archived
    expect(() => assertValidTransition(DocStatus.ARCHIVED, DocStatus.DRAFT, Role.ADMIN)).toThrow(WorkflowError);
  });

  it("should throw ForbiddenError (403) when role is not allowed", () => {
    // Viewer cannot submit or approve
    expect(() => assertValidTransition(DocStatus.DRAFT, DocStatus.SUBMITTED, Role.VIEWER)).toThrow(ForbiddenError);
    expect(() => assertValidTransition(DocStatus.SUBMITTED, DocStatus.APPROVED, Role.VIEWER)).toThrow(ForbiddenError);

    // Author cannot approve or publish or archive
    expect(() => assertValidTransition(DocStatus.SUBMITTED, DocStatus.APPROVED, Role.AUTHOR)).toThrow(ForbiddenError);
    expect(() => assertValidTransition(DocStatus.APPROVED, DocStatus.PUBLISHED, Role.AUTHOR)).toThrow(ForbiddenError);
    expect(() => assertValidTransition(DocStatus.DRAFT, DocStatus.ARCHIVED, Role.AUTHOR)).toThrow(ForbiddenError);
  });

  it("should cover all defined transitions", () => {
    expect(TRANSITIONS.length).toBe(9);
  });
});
