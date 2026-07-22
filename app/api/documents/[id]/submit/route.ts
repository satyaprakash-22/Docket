import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { toErrorResponse } from "@/lib/errors";
import { DocStatus } from "@prisma/client";
import { performTransition, parseExpectedVersion } from "../_transition";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const expectedVersion = parseExpectedVersion(body);

    const document = await performTransition({
      docId: id,
      session,
      action: "submit",
      toStatus: DocStatus.SUBMITTED,
      expectedVersion,
      forbiddenMessage:
        "Only the document's author can submit it for review, and only when it is in DRAFT status.",
    });

    return NextResponse.json({ document }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
