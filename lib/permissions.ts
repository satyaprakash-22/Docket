/**
 * lib/permissions.ts — The permission helper.
 *
 * The SINGLE source of truth for what each role can do.
 * Both API routes and the UI call this EXACT function — there is no drift
 * between "what the server enforces" and "what the UI shows."
 *
 * Interview line: "Hiding a button and enforcing a permission are backed
 * by the same function. There's no second copy that can get out of sync."
 */

import { Role, DocStatus, Document, User } from "@prisma/client";

export type Action =
  | "view"
  | "create"
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "reopen"
  | "publish"
  | "archive"
  | "viewHistory"
  | "viewPresence";

type DocumentContext = Pick<Document, "status" | "authorId">;

/**
 * Determines whether a user can perform an action on a document (or globally).
 *
 * @param user - The current session user (must have id and role)
 * @param action - The action to check
 * @param document - The document being acted on (optional for global actions like 'create')
 */
export function can(
  user: Pick<User, "id" | "role">,
  action: Action,
  document?: DocumentContext
): boolean {
  const { role, id: userId } = user;

  switch (action) {
    case "view":
      return canView(role, userId, document);

    case "create":
      return role === Role.AUTHOR;

    case "edit":
      if (!document) return false;
      return (
        role === Role.AUTHOR &&
        document.authorId === userId &&
        (document.status === DocStatus.DRAFT ||
          document.status === DocStatus.REJECTED)
      );

    case "submit":
      if (!document) return false;
      return (
        role === Role.AUTHOR &&
        document.authorId === userId &&
        document.status === DocStatus.DRAFT
      );

    case "approve":
      if (!document) return false;
      // A reviewer CANNOT approve their own document
      return (
        role === Role.REVIEWER &&
        document.authorId !== userId &&
        document.status === DocStatus.SUBMITTED
      );

    case "reject":
      if (!document) return false;
      // A reviewer CANNOT reject their own document
      return (
        role === Role.REVIEWER &&
        document.authorId !== userId &&
        document.status === DocStatus.SUBMITTED
      );

    case "reopen":
      if (!document) return false;
      return (
        role === Role.AUTHOR &&
        document.authorId === userId &&
        document.status === DocStatus.REJECTED
      );

    case "publish":
      if (!document) return false;
      return (
        (role === Role.REVIEWER || role === Role.ADMIN) &&
        document.status === DocStatus.APPROVED
      );

    case "archive":
      if (!document) return false;
      return (
        role === Role.ADMIN &&
        document.status !== DocStatus.ARCHIVED
      );

    case "viewHistory":
      if (!document) return false;
      return canViewHistory(role, userId, document);

    case "viewPresence":
      if (!document) return false;
      return role === Role.REVIEWER || role === Role.ADMIN;

    default:
      return false;
  }
}

function canView(
  role: Role,
  userId: string,
  document?: DocumentContext
): boolean {
  if (!document) return true; // Listing is always allowed (filtered per-role in the query)

  // Viewers can only see published documents
  if (role === Role.VIEWER) {
    return document.status === DocStatus.PUBLISHED;
  }

  // Authors can see their own documents (any status) + all published
  if (role === Role.AUTHOR) {
    return (
      document.authorId === userId ||
      document.status === DocStatus.PUBLISHED
    );
  }

  // Reviewers can see their review queue (submitted, approved) + published
  if (role === Role.REVIEWER) {
    return (
      document.status === DocStatus.SUBMITTED ||
      document.status === DocStatus.APPROVED ||
      document.status === DocStatus.PUBLISHED ||
      document.status === DocStatus.REJECTED // Reviewers can see rejected docs they reviewed
    );
  }

  // Admin can see everything
  if (role === Role.ADMIN) {
    return true;
  }

  return false;
}

function canViewHistory(
  role: Role,
  userId: string,
  document: DocumentContext
): boolean {
  if (role === Role.ADMIN) return true;
  if (role === Role.VIEWER) {
    // Viewers can see history only for published docs
    return document.status === DocStatus.PUBLISHED;
  }
  if (role === Role.AUTHOR) {
    // Authors can see history for their own docs
    return document.authorId === userId;
  }
  if (role === Role.REVIEWER) {
    // Reviewers can see history for docs in their queue or already reviewed
    return (
      document.status === DocStatus.SUBMITTED ||
      document.status === DocStatus.APPROVED ||
      document.status === DocStatus.REJECTED ||
      document.status === DocStatus.PUBLISHED ||
      document.status === DocStatus.ARCHIVED
    );
  }
  return false;
}
