/**
 * lib/workflow.ts — The state machine spine.
 *
 * This is the SINGLE place in the codebase that knows the shape of the workflow.
 * Every mutating API route calls assertValidTransition() before touching the database.
 * There are no scattered `if` statements across route handlers.
 *
 * Interview line: "There's exactly one place in the codebase that knows whether
 * a given transition is valid. If you find a bug in the workflow, you fix it here,
 * and it's fixed everywhere."
 */

import { DocStatus, AuditAction, Role } from "@prisma/client";
import { ForbiddenError, WorkflowError } from "./errors";

export type Transition = {
  from: DocStatus;
  to: DocStatus;
  action: AuditAction;
  allowedRoles: Role[];
};

/**
 * The complete transition table for the document approval workflow.
 *
 * State diagram:
 *   draft ──submit──▶ submitted ──approve──▶ approved ──publish──▶ published
 *     ▲                    │
 *     │                 reject (comment required)
 *     └──reopen───────── rejected
 *
 *   admin can archive from: draft, submitted, approved, published ──▶ archived (terminal)
 */
export const TRANSITIONS: Transition[] = [
  {
    from: DocStatus.DRAFT,
    to: DocStatus.SUBMITTED,
    action: AuditAction.SUBMITTED,
    allowedRoles: [Role.AUTHOR],
  },
  {
    from: DocStatus.SUBMITTED,
    to: DocStatus.APPROVED,
    action: AuditAction.APPROVED,
    allowedRoles: [Role.REVIEWER],
  },
  {
    from: DocStatus.SUBMITTED,
    to: DocStatus.REJECTED,
    action: AuditAction.REJECTED,
    allowedRoles: [Role.REVIEWER],
  },
  {
    from: DocStatus.REJECTED,
    to: DocStatus.DRAFT,
    action: AuditAction.REOPENED,
    allowedRoles: [Role.AUTHOR],
  },
  {
    from: DocStatus.APPROVED,
    to: DocStatus.PUBLISHED,
    action: AuditAction.PUBLISHED,
    allowedRoles: [Role.REVIEWER, Role.ADMIN],
  },
  {
    from: DocStatus.DRAFT,
    to: DocStatus.ARCHIVED,
    action: AuditAction.ARCHIVED,
    allowedRoles: [Role.ADMIN],
  },
  {
    from: DocStatus.SUBMITTED,
    to: DocStatus.ARCHIVED,
    action: AuditAction.ARCHIVED,
    allowedRoles: [Role.ADMIN],
  },
  {
    from: DocStatus.APPROVED,
    to: DocStatus.ARCHIVED,
    action: AuditAction.ARCHIVED,
    allowedRoles: [Role.ADMIN],
  },
  {
    from: DocStatus.PUBLISHED,
    to: DocStatus.ARCHIVED,
    action: AuditAction.ARCHIVED,
    allowedRoles: [Role.ADMIN],
  },
];

/**
 * Validates that a transition from `from` to `to` is:
 * 1. Defined in the TRANSITIONS table (workflow validity)
 * 2. Allowed for the given `role` (role authorization)
 *
 * Throws WorkflowError (400) if the transition is not defined.
 * Throws ForbiddenError (403) if the role is not permitted.
 *
 * @returns The matching Transition (for use in creating audit events).
 */
export function assertValidTransition(
  from: DocStatus,
  to: DocStatus,
  role: Role
): Transition {
  const transition = TRANSITIONS.find((t) => t.from === from && t.to === to);

  if (!transition) {
    throw new WorkflowError(
      `Invalid transition: ${from} → ${to}. This state change is not permitted.`
    );
  }

  if (!transition.allowedRoles.includes(role)) {
    throw new ForbiddenError(
      `Role ${role} cannot perform the transition ${from} → ${to}. ` +
        `Allowed roles: ${transition.allowedRoles.join(", ")}.`
    );
  }

  return transition;
}

/**
 * Returns the next possible transitions from a given status for a given role.
 * Used by the UI to render the StatusStepper and show/hide action buttons.
 */
export function getAvailableTransitions(
  from: DocStatus,
  role: Role
): Transition[] {
  return TRANSITIONS.filter(
    (t) => t.from === from && t.allowedRoles.includes(role)
  );
}

/**
 * The ordered workflow steps for the stepper UI component.
 * Archived is a terminal sidebar state, not a main step.
 */
export const WORKFLOW_STEPS: DocStatus[] = [
  DocStatus.DRAFT,
  DocStatus.SUBMITTED,
  DocStatus.APPROVED,
  DocStatus.PUBLISHED,
];
