/**
 * lib/session.ts — Session management using iron-session.
 *
 * The server derives identity from the signed httpOnly cookie on EVERY request.
 * The client never sends a role or userId — the cookie is the only source of truth.
 *
 * Interview line: "There's no request a client can forge from devtools that
 * changes their role — the server reads it from a signed cookie."
 */

import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { UnauthorizedError } from "./errors";

export type SessionData = {
  userId: string;
  role: Role;
  name: string;
  email: string;
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "elevatebox-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};

export type AppSession = IronSession<SessionData>;

/**
 * Gets the current session. Returns empty session if not authenticated.
 * Use requireSession() when you need a guaranteed authenticated session.
 */
export async function getSession(): Promise<AppSession> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * Gets the current session and throws UnauthorizedError (401) if not authenticated.
 * Use this in all protected API routes.
 */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession();

  if (!session.userId || !session.role) {
    throw new UnauthorizedError();
  }

  return {
    userId: session.userId,
    role: session.role,
    name: session.name,
    email: session.email,
  };
}
