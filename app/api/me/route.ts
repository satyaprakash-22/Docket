import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json({ user: session }, { status: 200 });
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
