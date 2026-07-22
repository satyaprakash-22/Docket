# Design Note — Controlled Document Approval System

**Author:** Satya Prakash  
**Target:** ElevateBox Engineering Challenge Submission  

---

## 1. Most Important Invariants

1. **State Machine Centralization:** A document's status can only change via legal transitions defined in the state machine matrix (`lib/workflow.ts`). There are no scattered transition rules or `if` statements across API routes or UI components.
2. **Atomic Execution & Audit Consistency:** Every status change or content edit is executed inside an atomic database transaction (`prisma.$transaction`) alongside the creation of an append-only `AuditEvent`. A state update will never commit without its corresponding audit entry, and vice-versa.
3. **Optimistic Concurrency Protection:** Stale client writes are strictly rejected via a `version` column and a conditional `updateMany({ where: { id, version: expectedVersion } })`. The server never performs a separate "read-then-write" race window.
4. **Self-Approval Protection:** A Reviewer can **never** approve or reject a document they authored (`document.authorId !== session.userId`). Enforced on both server and client via `lib/permissions.ts`.
5. **No Data Exposure to Unauthorized Roles:** Viewers are strictly restricted to published documents. Unauthenticated or unauthorized direct requests for non-published documents return `404 Not Found` (never `403` with state details), preventing information disclosure or document existence leaks.

---

## 2. DB vs. Application-Code Invariants

| Layer | Responsibility | Details |
|---|---|---|
| **Database (PostgreSQL / Prisma)** | Data Integrity & Constraints | Standard column types, native ENUM types (`Role`, `DocStatus`, `AuditAction`), foreign key relations, unique email indexes, optimistic concurrency version checks. |
| **Application (`lib/workflow.ts` & `lib/permissions.ts`)** | Business Logic & Workflow Guards | State machine transition legality, role authorization matrix, self-approval prevention, rejection comment requirements. |

### Why draw the line here?
Enforcing workflow transition rules and role matrices in TypeScript provides maximum flexibility, testability, and fast error diagnostics while maintaining a single pure source of truth (`assertValidTransition` and `can()`).

**What I'd change for a strict production environment:**
1. A Postgres raw SQL trigger (`BEFORE UPDATE ON "Document"`) to validate transitions directly on the DB level.
2. An Event-Sourced architecture where current status is a projection derived directly from the immutable `AuditEvent` log rather than a mutable status column.

---

## 3. Permission Model

Permissions are governed by `lib/permissions.ts` with a pure function:
```ts
can(user: { id: string; role: Role }, action: Action, document?: DocumentContext): boolean
```
Both API routes (e.g. `app/api/documents/[id]/approve/route.ts`) and frontend UI components (e.g. `DocumentDetailClient.tsx`) invoke this exact function. This eliminates drift between what the UI renders and what the server enforces.

---

## 4. Preventing Stale / Conflicting Updates

1. **Version Token:** Every `Document` maintains a `version: Int` field.
2. **Conditional Atomic Write:** When a mutation request arrives, the client sends `expectedVersion`. The DB updates atomically:
   ```ts
   const result = await tx.document.updateMany({
     where: { id, version: expectedVersion, status: currentStatus },
     data: { status: newStatus, version: { increment: 1 } },
   });
   if (result.count === 0) throw new ConflictError('STALE_VERSION');
   ```
3. **Conflict Resolution UI (Differentiator #1):** If `409 STALE_VERSION` is returned, the frontend opens a side-by-side modal showing "Your View (Stale)" vs "Current State" (who changed it and when), allowing the user to either discard their attempt or reload current state.

---

## 5. Audit Log Design

- **Append-Only:** `AuditEvent` has no update or delete routes anywhere.
- **Atomic Transaction:** Every `AuditEvent` is inserted in the exact same `prisma.$transaction` block as the `Document` update.
- **Rich Metadata (Differentiator #5):** Edit events log metadata such as `{ titleBefore, titleAfter }` for inline visual diffing on the history timeline.

---

## 6. Failure Cases Considered

1. **Concurrent Reviewers (Bob & Carol):** Prevented by optimistic concurrency (`version` column). Whichever request reaches Postgres first increments the version; the second gets `409 STALE_VERSION` and triggers the conflict screen.
2. **DB failure during transaction:** `prisma.$transaction` guarantees rollback. Neither document state nor audit log will be written partially.
3. **Forged Session Roles:** Session tokens are signed using `iron-session`. The server re-derives identity and role from the httpOnly session cookie on every request—the client can never forge a role header.
4. **Guessed Document IDs:** Requests for draft/submitted docs by unauthorized roles return `404 Not Found` to prevent revealing document existence.

---

## 7. Differentiators Implemented

1. **Side-by-side Conflict Resolution Screen:** Interactive visual diff when `409 STALE_VERSION` occurs.
2. **Reviewer Live Presence Indicator:** Live presence ping every 5s showing "Carol is also viewing this document" to prevent collision beforehand.
3. **Audit Timeline Diff View:** Visual before/after title changes on `EDITED` audit events.
4. **Compliance Audit Export View:** Printable compliance audit summary (`/documents/[id]/export`) listing author, approval history, and complete audit log.

---

## 8. What I'd Improve with More Time

1. **WebSockets / Server-Sent Events:** Replace the 5s presence polling with real-time SSE or WebSockets.
2. **Postgres DB Triggers:** Add raw SQL migration triggers for workflow transition validation at the DB engine layer.
3. **Automated E2E Tests:** Add Playwright browser tests for multi-user concurrency flows.
