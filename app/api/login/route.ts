import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { toErrorResponse, ValidationError, NotFoundError } from "@/lib/errors";

const loginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address.")
    .min(1, "Email is required."),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundError(
        `No user found with email "${email}". Check the seeded logins in the README.`
      );
    }

    const session = await getSession();
    session.userId = user.id;
    session.role = user.role;
    session.name = user.name;
    session.email = user.email;
    await session.save();

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const { json, status } = toErrorResponse(err);
    return NextResponse.json(json, { status });
  }
}
