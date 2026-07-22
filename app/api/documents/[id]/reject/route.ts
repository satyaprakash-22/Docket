import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { toErrorResponse, ValidationError } from "@/lib/errors";
import { DocStatus } from "@prisma/client";
import { performTransition, parseExpectedVersion } from "../_transition";

const rejectSchema = z.object({
  expectedVersion: z.number().int().positive(),
  comment: z
    .string()
    .min(1, "A rejection comment is required.")
    .trim()
    .refine((s) => s.length > 0, "Rejection comment cannot be blank."),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();

    const parsed = rejectSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const { expectedVersion, comment } = parsed.data;

    const document = await performTransition({
      docId: id,
      session,
      action: "reject",
      toStatus: DocStatus.REJECTED,
      expectedVersion,
      comment,
      forbiddenMessage:
        "Only reviewers can reject documents, and a reviewer cannot reject their own document.",
    });

    return NextResponse.json({ document }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
