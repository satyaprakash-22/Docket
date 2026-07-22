/**
 * Shared helper for document transition API routes.
 * Used by submit, approve, reject, reopen, publish, archive.
 *
 * Encapsulates:
 * 1. Fetch + visibility check
 * 2. Permission check (can())
 * 3. Workflow validation (assertValidTransition)
 * 4. Atomic DB transaction: updateMany (with version + status pin) + auditEvent.create
 */

import { prisma } from "@/lib/db";
import { can, Action } from "@/lib/permissions";
import { assertValidTransition } from "@/lib/workflow";
import {
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from "@/lib/errors";
import { DocStatus, AuditAction } from "@prisma/client";
import type { SessionData } from "@/lib/session";

export async function performTransition(opts: {
  docId: string;
  session: SessionData;
  action: Action;
  toStatus: DocStatus;
  expectedVersion: number;
  comment?: string;
  forbiddenMessage?: string;
}) {
  const { docId, session, action, toStatus, expectedVersion, comment, forbiddenMessage } = opts;

  // 1. Fetch document (visibility check — 404 for invisible docs)
  const document = await prisma.document.findUnique({
    where: { id: docId },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!document) throw new NotFoundError();

  if (
    !can(
      { id: session.userId, role: session.role },
      "view",
      { status: document.status, authorId: document.authorId }
    )
  ) {
    throw new NotFoundError(); // Don't reveal existence
  }

  // 2. Permission check
  if (
    !can(
      { id: session.userId, role: session.role },
      action,
      { status: document.status, authorId: document.authorId }
    )
  ) {
    throw new ForbiddenError(
      forbiddenMessage ?? `You do not have permission to perform this action.`
    );
  }

  // 3. Workflow validation (will throw WorkflowError or ForbiddenError)
  const transition = assertValidTransition(document.status, toStatus, session.role);

  // 4. Atomic transaction: conditional update + audit event
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.document.updateMany({
      where: {
        id: docId,
        version: expectedVersion,
        status: document.status, // Belt-and-suspenders: also pin current status
      },
      data: {
        status: toStatus,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictError();
    }

    await tx.auditEvent.create({
      data: {
        documentId: docId,
        actorId: session.userId,
        action: transition.action,
        fromStatus: document.status,
        toStatus,
        comment: comment ?? null,
      },
    });

    return tx.document.findUnique({
      where: { id: docId },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  });

  return updated;
}

export const versionSchema = {
  expectedVersion: "number (int, positive) — the version you last read",
};

export function parseExpectedVersion(body: Record<string, unknown>): number {
  const v = body.expectedVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new ValidationError(
      "expectedVersion is required and must be a positive integer."
    );
  }
  return v;
}
