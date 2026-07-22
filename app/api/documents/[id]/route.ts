import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  toErrorResponse,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "@/lib/errors";
import { AuditAction, DocStatus } from "@prisma/client";

const editDocSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required.")
    .trim()
    .refine((s) => s.length > 0, "Title cannot be blank.")
    .optional(),
  body: z
    .string()
    .min(1, "Body is required.")
    .trim()
    .refine((s) => s.length > 0, "Body cannot be blank.")
    .optional(),
  expectedVersion: z
    .number()
    .int()
    .positive("Expected version must be a positive integer."),
});

async function getDocumentOrThrow(id: string, userId: string, userRole: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!document) {
    throw new NotFoundError();
  }

  // For unauthorized users, return 404 (not 403) — don't reveal existence
  if (
    !can(
      { id: userId, role: userRole as never },
      "view",
      { status: document.status, authorId: document.authorId }
    )
  ) {
    throw new NotFoundError();
  }

  return document;
}

/**
 * GET /api/documents/:id
 * Returns a single document. Returns 404 if not found OR not visible to the user
 * (never 403 — we don't confirm existence to unauthorized viewers).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const document = await getDocumentOrThrow(id, session.userId, session.role);

    return NextResponse.json({ document }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}

/**
 * PATCH /api/documents/:id
 * Edits title and/or body. Only allowed when status ∈ {DRAFT, REJECTED} and user is the author.
 * Requires expectedVersion for optimistic concurrency.
 * Atomically updates document + writes EDITED audit event.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const document = await getDocumentOrThrow(id, session.userId, session.role);

    if (
      !can(
        { id: session.userId, role: session.role },
        "edit",
        { status: document.status, authorId: document.authorId }
      )
    ) {
      if (document.authorId !== session.userId) {
        throw new ForbiddenError("You can only edit your own documents.");
      }
      throw new ForbiddenError(
        `Documents in ${document.status} status cannot be edited. Only DRAFT and REJECTED documents are editable.`
      );
    }

    const body = await request.json();
    const parsed = editDocSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const { title, body: docBody, expectedVersion } = parsed.data;

    const titleChanged = title !== undefined && title !== document.title;
    const bodyChanged = docBody !== undefined && docBody !== document.body;

    if (!titleChanged && !bodyChanged) {
      // No actual change — return current doc as-is
      return NextResponse.json({ document }, { status: 200 });
    }

    // Atomic: optimistic concurrency check + update + audit event in one transaction
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.document.updateMany({
        where: { id, version: expectedVersion, status: document.status },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(docBody !== undefined ? { body: docBody } : {}),
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new ConflictError();
      }

      await tx.auditEvent.create({
        data: {
          documentId: id,
          actorId: session.userId,
          action: AuditAction.EDITED,
          fromStatus: document.status,
          toStatus: document.status,
          metadata: {
            titleChanged,
            bodyChanged,
            ...(titleChanged
              ? { titleBefore: document.title, titleAfter: title }
              : {}),
          },
        },
      });

      return tx.document.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      });
    });

    return NextResponse.json({ document: updated }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
