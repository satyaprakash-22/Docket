import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { toErrorResponse, ForbiddenError, ValidationError } from "@/lib/errors";
import { DocStatus, AuditAction, Role } from "@prisma/client";

const createDocSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required.")
    .trim()
    .refine((s) => s.length > 0, "Title cannot be blank."),
  body: z
    .string()
    .min(1, "Body is required.")
    .trim()
    .refine((s) => s.length > 0, "Body cannot be blank."),
});

/**
 * GET /api/documents
 * Returns documents filtered by role:
 * - VIEWER: published only
 * - AUTHOR: own docs (any status) + published
 * - REVIEWER: submitted + approved + published + rejected (their queue)
 * - ADMIN: all documents
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") as DocStatus | null;

    let whereClause: Parameters<typeof prisma.document.findMany>[0]["where"] = {};

    if (session.role === Role.VIEWER) {
      whereClause = { status: DocStatus.PUBLISHED };
    } else if (session.role === Role.AUTHOR) {
      whereClause = {
        OR: [
          { authorId: session.userId },
          { status: DocStatus.PUBLISHED },
        ],
      };
    } else if (session.role === Role.REVIEWER) {
      whereClause = {
        status: {
          in: [
            DocStatus.SUBMITTED,
            DocStatus.APPROVED,
            DocStatus.REJECTED,
            DocStatus.PUBLISHED,
          ],
        },
      };
    } else if (session.role === Role.ADMIN) {
      whereClause = {}; // All documents
    }

    // Apply optional status filter (on top of role-based filter)
    if (statusFilter && Object.values(DocStatus).includes(statusFilter)) {
      whereClause = {
        AND: [whereClause, { status: statusFilter }],
      };
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ documents }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}

/**
 * POST /api/documents
 * Creates a new draft document. AUTHOR role only.
 * Atomically inserts Document + CREATED AuditEvent in one transaction.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();

    if (!can({ id: session.userId, role: session.role }, "create")) {
      throw new ForbiddenError("Only authors can create documents.");
    }

    const body = await request.json();
    const parsed = createDocSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const { title, body: docBody } = parsed.data;

    // Atomic: create document + audit event in one transaction
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          title,
          body: docBody,
          status: DocStatus.DRAFT,
          authorId: session.userId,
        },
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      await tx.auditEvent.create({
        data: {
          documentId: doc.id,
          actorId: session.userId,
          action: AuditAction.CREATED,
          toStatus: DocStatus.DRAFT,
        },
      });

      return doc;
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
