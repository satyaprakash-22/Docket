import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { toErrorResponse, NotFoundError, ForbiddenError } from "@/lib/errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    // First check if document exists and is visible to this user
    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, status: true, authorId: true },
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

    if (
      !can(
        { id: session.userId, role: session.role },
        "viewHistory",
        { status: document.status, authorId: document.authorId }
      )
    ) {
      throw new ForbiddenError("You do not have permission to view this document's history.");
    }

    const events = await prisma.auditEvent.findMany({
      where: { documentId: id },
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ events }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
