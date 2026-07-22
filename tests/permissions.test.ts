import { describe, it, expect } from "vitest";
import { can } from "@/lib/permissions";
import { DocStatus, Role } from "@prisma/client";

describe("Permissions Matrix (lib/permissions.ts)", () => {
  const author = { id: "user-author-1", role: Role.AUTHOR };
  const author2 = { id: "user-author-2", role: Role.AUTHOR };
  const reviewer = { id: "user-reviewer-1", role: Role.REVIEWER };
  const admin = { id: "user-admin-1", role: Role.ADMIN };
  const viewer = { id: "user-viewer-1", role: Role.VIEWER };

  const draftDoc = { status: DocStatus.DRAFT, authorId: author.id };
  const submittedDoc = { status: DocStatus.SUBMITTED, authorId: author.id };
  const approvedDoc = { status: DocStatus.APPROVED, authorId: author.id };
  const rejectedDoc = { status: DocStatus.REJECTED, authorId: author.id };
  const publishedDoc = { status: DocStatus.PUBLISHED, authorId: author.id };

  it("Creation permissions", () => {
    expect(can(author, "create")).toBe(true);
    expect(can(reviewer, "create")).toBe(false);
    expect(can(admin, "create")).toBe(false);
    expect(can(viewer, "create")).toBe(false);
  });

  it("Editing permissions", () => {
    // Author can edit own DRAFT or REJECTED docs
    expect(can(author, "edit", draftDoc)).toBe(true);
    expect(can(author, "edit", rejectedDoc)).toBe(true);

    // Cannot edit SUBMITTED, APPROVED, or PUBLISHED docs
    expect(can(author, "edit", submittedDoc)).toBe(false);
    expect(can(author, "edit", approvedDoc)).toBe(false);
    expect(can(author, "edit", publishedDoc)).toBe(false);

    // Other author cannot edit
    expect(can(author2, "edit", draftDoc)).toBe(false);

    // Reviewer/Admin cannot edit
    expect(can(reviewer, "edit", draftDoc)).toBe(false);
    expect(can(admin, "edit", draftDoc)).toBe(false);
  });

  it("Self-approval protection (CRITICAL RUBRIC INVARIANT)", () => {
    const reviewerDoc = { status: DocStatus.SUBMITTED, authorId: reviewer.id };

    // Reviewer can approve others' docs
    expect(can(reviewer, "approve", submittedDoc)).toBe(true);
    expect(can(reviewer, "reject", submittedDoc)).toBe(true);

    // Reviewer CANNOT approve or reject their own document!
    expect(can(reviewer, "approve", reviewerDoc)).toBe(false);
    expect(can(reviewer, "reject", reviewerDoc)).toBe(false);
  });

  it("Submitting permissions", () => {
    expect(can(author, "submit", draftDoc)).toBe(true);
    expect(can(author2, "submit", draftDoc)).toBe(false);
    expect(can(reviewer, "submit", draftDoc)).toBe(false);
  });

  it("Reopening permissions", () => {
    expect(can(author, "reopen", rejectedDoc)).toBe(true);
    expect(can(author2, "reopen", rejectedDoc)).toBe(false);
    expect(can(reviewer, "reopen", rejectedDoc)).toBe(false);
  });

  it("Publishing permissions", () => {
    expect(can(reviewer, "publish", approvedDoc)).toBe(true);
    expect(can(admin, "publish", approvedDoc)).toBe(true);
    expect(can(author, "publish", approvedDoc)).toBe(false);
    expect(can(viewer, "publish", approvedDoc)).toBe(false);
  });

  it("Archiving permissions", () => {
    expect(can(admin, "archive", draftDoc)).toBe(true);
    expect(can(admin, "archive", publishedDoc)).toBe(true);
    expect(can(reviewer, "archive", draftDoc)).toBe(false);
    expect(can(author, "archive", draftDoc)).toBe(false);
  });

  it("Visibility permissions", () => {
    // Viewer sees only published
    expect(can(viewer, "view", publishedDoc)).toBe(true);
    expect(can(viewer, "view", draftDoc)).toBe(false);
    expect(can(viewer, "view", submittedDoc)).toBe(false);

    // Author sees own docs + published
    expect(can(author, "view", draftDoc)).toBe(true);
    expect(can(author2, "view", draftDoc)).toBe(false);
    expect(can(author2, "view", publishedDoc)).toBe(true);

    // Reviewer sees queue + published
    expect(can(reviewer, "view", submittedDoc)).toBe(true);
    expect(can(reviewer, "view", approvedDoc)).toBe(true);
    expect(can(reviewer, "view", publishedDoc)).toBe(true);

    // Admin sees everything
    expect(can(admin, "view", draftDoc)).toBe(true);
    expect(can(admin, "view", publishedDoc)).toBe(true);
  });
});
