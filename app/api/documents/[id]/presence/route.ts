import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { toErrorResponse, NotFoundError } from "@/lib/errors";

// Presence window: show as "viewing" if last seen within 60 seconds
const PRESENCE_WINDOW_MS = 60 * 1000;

/**
 * GET /api/documents/:id/presence
 * Returns list of other users currently viewing this document.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!document) throw new NotFoundError();

    const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS);

    const presence = await prisma.presence.findMany({
      where: {
        documentId: id,
        userId: { not: session.userId }, // Exclude self
        lastSeenAt: { gte: cutoff },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    // Get user details for each presence entry
    const userIds = presence.map((p) => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    });

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const viewers = presence.map((p) => ({
      userId: p.userId,
      user: userMap[p.userId],
      lastSeenAt: p.lastSeenAt,
    }));

    return NextResponse.json({ viewers }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}

/**
 * POST /api/documents/:id/presence
 * Upserts a presence record for the current user on this document.
 * Called every 5 seconds by the client while viewing.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    await prisma.presence.upsert({
      where: {
        userId_documentId: {
          userId: session.userId,
          documentId: id,
        },
      },
      update: { lastSeenAt: new Date() },
      create: {
        userId: session.userId,
        documentId: id,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
