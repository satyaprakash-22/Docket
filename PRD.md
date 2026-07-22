# PRD — Controlled Document Approval System
**For:** ElevateBox Engineering Challenge submission
**Author:** Satya Prakash

---

## 0. How to use this document

This PRD is written so an AI build agent can generate the project in one pass without guessing. It is organized as:
1. Product framing (what we're really being tested on)
2. Tech stack decision (locked, with reasons)
3. Data model (ready-to-paste Prisma schema)
4. State machine (the spine — do not deviate without logging why)
5. Roles & permission matrix
6. API contract (every endpoint, its guard, its failure modes)
7. Feature specs, one per user story, each with acceptance criteria
8. Concurrency & transaction design
9. Audit log design
10. UI/UX direction (elegant, not template-looking)
11. **Differentiators** — the features that make this submission stand out in an interview
12. Testing plan
13. DESIGN.md template (required deliverable)
14. Folder structure & build order
15. Submission checklist mapped directly to ElevateBox's own rubric
16. README.md template + Git/GitHub automation instructions for Antigravity

Build in the order in section 14. Do not add scope outside sections 7 and 11 — the brief explicitly penalizes over-engineering unrelated to the rubric.

---

## 1. Product framing

One sentence, from the brief: **a document should never become published unless the right person approved it, and every important action must be recorded in an audit log.**

The evaluators (their own words) are not grading a pretty CRUD app. They are grading:
- Does the **server** refuse things the UI merely hides?
- Does **every** state change happen atomically with its audit event?
- Does the app survive **two people acting on the same document at once**?
- Is the state machine enforced centrally, not scattered across route handlers?

Everything in this PRD is built around those four questions. If a feature doesn't serve one of them, it's decoration and goes in section 11 (optional), never section 7 (core).

---

## 2. Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | Listed as an explicitly acceptable swap for SvelteKit; matches prior full-stack project experience (React + Node), fastest path to a coherent, understandable codebase for the interview discussion. |
| Language | **TypeScript**, strict mode on | Required. |
| Database | **PostgreSQL** (local via Docker, or Supabase free tier) | Preferred by the brief; gives real transactions, enums, and CHECK constraints, which are strong signals in the rubric. |
| ORM | **Prisma** | Listed as an acceptable swap for Drizzle; supports `$transaction`, optimistic concurrency via a `version` column, and DB-level enums cleanly. |
| Auth | **Seeded users + signed session cookie** (no NextAuth/OAuth — explicitly out of scope) | A `POST /api/login` that takes an email, looks it up in a seeded `users` table, and sets an httpOnly signed cookie (`jose` or `iron-session`) containing `{ userId, role }`. Every server action re-derives the user from the cookie — never trusts the client. |
| Styling | **Tailwind CSS + hand-tuned design tokens** (see §10) | Fast to build, but the point is to *not* look like a stock shadcn/ui dashboard — see §10 for how. |
| Validation | **Zod** on every mutation input, server-side | Cheap, typed, and directly demonstrates "input validation is real" (Story 2's rubric point). |
| Testing | **Vitest** + a handful of integration tests hitting real API routes against a test DB | Directly addressed as a "strong signal" in the rubric. |

No file upload, no rich text editor, no OAuth, no email sending, no real deployment required — all explicitly out of scope per the brief. Local run only, documented in README.

---

## 3. Data model

```prisma
// schema.prisma

enum Role {
  VIEWER
  AUTHOR
  REVIEWER
  ADMIN
}

enum DocStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
  PUBLISHED
  ARCHIVED
}

model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  role      Role
  createdAt DateTime @default(now())

  documents      Document[]   @relation("AuthoredDocuments")
  auditEvents    AuditEvent[]
}

model Document {
  id          String    @id @default(cuid())
  title       String
  body        String
  status      DocStatus @default(DRAFT)
  version     Int       @default(1)      // optimistic concurrency token
  authorId    String
  author      User      @relation("AuthoredDocuments", fields: [authorId], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  auditEvents AuditEvent[]

  // DB-level guard: status can only ever be one of the enum values (Postgres enforces this natively).
  // Transition legality is enforced in application code (see §4) inside the same transaction as the audit write.

  @@index([status])
  @@index([authorId])
}

enum AuditAction {
  CREATED
  EDITED
  SUBMITTED
  APPROVED
  REJECTED
  REOPENED
  PUBLISHED
  ARCHIVED
}

model AuditEvent {
  id           String       @id @default(cuid())
  documentId   String
  document     Document     @relation(fields: [documentId], references: [id])
  actorId      String
  actor        User         @relation(fields: [actorId], references: [id])
  action       AuditAction
  fromStatus   DocStatus?
  toStatus     DocStatus?
  comment      String?
  metadata     Json?        // e.g. { titleChanged: true } for EDITED events
  createdAt    DateTime     @default(now())

  // Append-only. No update/delete path exposed anywhere in the app.

  @@index([documentId, createdAt])
}
```

**Seed data** (`prisma/seed.ts`):

| Name | Email | Role |
|---|---|---|
| Alice Author | alice@example.com | AUTHOR |
| Bob Reviewer | bob@example.com | REVIEWER |
| Carol Reviewer | carol@example.com | REVIEWER |
| Aman Admin | admin@example.com | ADMIN |
| Vikram Viewer | viewer@example.com | VIEWER |

*(Two reviewers seeded on purpose — needed to demo Story 8's concurrency scenario, which the brief describes using two named reviewers, Bob and Carol.)*

---

## 4. State machine (the spine)

```
draft ──submit──▶ submitted ──approve──▶ approved ──publish──▶ published
  ▲                    │
  │                 reject (comment required)
  └──reopen───────── rejected

admin can archive from: draft, submitted, approved, published ──▶ archived (terminal)
```

Implement this as a **single pure function**, not scattered `if` statements across route handlers:

```ts
// lib/workflow.ts
type Transition = { from: DocStatus; to: DocStatus; action: AuditAction; allowedRoles: Role[] };

const TRANSITIONS: Transition[] = [
  { from: 'DRAFT',     to: 'SUBMITTED', action: 'SUBMITTED', allowedRoles: ['AUTHOR'] },
  { from: 'SUBMITTED', to: 'APPROVED',  action: 'APPROVED',  allowedRoles: ['REVIEWER'] },
  { from: 'SUBMITTED', to: 'REJECTED',  action: 'REJECTED',  allowedRoles: ['REVIEWER'] },
  { from: 'REJECTED',  to: 'DRAFT',     action: 'REOPENED',  allowedRoles: ['AUTHOR'] },
  { from: 'APPROVED',  to: 'PUBLISHED', action: 'PUBLISHED', allowedRoles: ['REVIEWER', 'ADMIN'] },
  { from: 'DRAFT',     to: 'ARCHIVED',  action: 'ARCHIVED',  allowedRoles: ['ADMIN'] },
  { from: 'SUBMITTED', to: 'ARCHIVED',  action: 'ARCHIVED',  allowedRoles: ['ADMIN'] },
  { from: 'APPROVED',  to: 'ARCHIVED',  action: 'ARCHIVED',  allowedRoles: ['ADMIN'] },
  { from: 'PUBLISHED', to: 'ARCHIVED',  action: 'ARCHIVED',  allowedRoles: ['ADMIN'] },
];

export function assertValidTransition(from: DocStatus, to: DocStatus, role: Role): Transition {
  const t = TRANSITIONS.find(t => t.from === from && t.to === to);
  if (!t) throw new WorkflowError(`Invalid transition ${from} → ${to}`);
  if (!t.allowedRoles.includes(role)) throw new ForbiddenError(`${role} cannot perform this transition`);
  return t;
}
```

Every mutating endpoint calls `assertValidTransition` before touching the database. There is exactly one place in the codebase that knows the shape of the workflow — this is what "clear state transition logic" in the rubric is asking for, and it's an easy thing to walk an interviewer through.

Extra rule not in the diagram but required by the rubric: **ownership** and **self-approval** are checked separately from the transition table (they depend on *who*, not just *what state*):
- `submit`: `document.authorId === session.userId`
- `approve` / `reject`: `document.authorId !== session.userId` (a reviewer can never act on their own document)
- `edit`: `document.authorId === session.userId` AND `status ∈ {DRAFT, REJECTED}`

---

## 5. Roles & permission matrix

| Action | Viewer | Author (own doc) | Author (others') | Reviewer | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| View published docs | ✅ | ✅ | ✅ | ✅ | ✅ |
| View draft/submitted/approved/rejected docs | ❌ | ✅ (own only) | ❌ | ✅ (queue) | ✅ |
| Create document | ❌ | ✅ | — | ❌ | ❌ |
| Edit document | ❌ | ✅ (draft/rejected, own) | ❌ | ❌ | ❌ |
| Submit for review | ❌ | ✅ (own) | ❌ | ❌ | ❌ |
| Approve / reject | ❌ | ❌ (never own) | ❌ | ✅ (not own) | ❌ |
| Publish | ❌ | ❌ | ❌ | ✅ | ✅ |
| Archive | ❌ | ❌ | ❌ | ❌ | ✅ |
| View audit history | ❌ (published docs only, if you choose to expose it) | ✅ (own docs) | ❌ | ✅ (docs in their queue / reviewed) | ✅ (all) |

Enforce this matrix with a single `can(user, action, document)` helper (`lib/permissions.ts`) used identically by every API route and by the UI (to decide what to render). **The UI check and the API check must call the exact same function** — this is the cleanest way to prove to an interviewer that "hiding a button" and "enforcing a permission" are backed by one source of truth, not two copies that can drift.

---

## 6. API contract

All routes under `/api`. All mutating routes require a valid session cookie; missing/invalid session → `401`. Failing a permission or transition check → `403` with a machine-readable reason, never a silent no-op.

| Method & Path | Auth | Description | Key failure modes |
|---|---|---|---|
| `POST /api/login` | none | Body: `{ email }`. Looks up seeded user, sets session cookie. | 404 unknown email |
| `POST /api/logout` | session | Clears cookie | — |
| `GET /api/me` | session | Returns current user + role | — |
| `GET /api/documents` | session | List, filtered by role (viewer→published only; author→own+published; reviewer→queue+published; admin→all) | — |
| `POST /api/documents` | session, AUTHOR | Create draft. Body: `{ title, body }`, Zod-validated non-empty. | 400 empty fields, 403 wrong role |
| `GET /api/documents/:id` | session | Fetch one, 404 if not visible to this role/ownership, 403 if exists but not permitted (decide and document which — see §7 note) | |
| `PATCH /api/documents/:id` | session, AUTHOR (owner) | Edit title/body. Body includes `expectedVersion`. Only allowed if `status ∈ {DRAFT, REJECTED}`. | 409 version mismatch, 403 not owner/wrong state |
| `POST /api/documents/:id/submit` | session, AUTHOR (owner) | Body: `{ expectedVersion }` | 409 stale, 400 invalid transition |
| `POST /api/documents/:id/approve` | session, REVIEWER (not owner) | Body: `{ expectedVersion }` | 409 stale, 403 self-approval |
| `POST /api/documents/:id/reject` | session, REVIEWER (not owner) | Body: `{ expectedVersion, comment }`, comment required non-empty | 400 missing comment |
| `POST /api/documents/:id/reopen` | session, AUTHOR (owner) | `rejected → draft` | 400 invalid transition |
| `POST /api/documents/:id/publish` | session, REVIEWER or ADMIN | `approved → published` | 400 invalid transition |
| `POST /api/documents/:id/archive` | session, ADMIN | From any non-terminal state | 400 already archived |
| `GET /api/documents/:id/history` | session, must have visibility on doc | Chronological audit events | 403 no access |

Standard error shape everywhere:
```json
{ "error": { "code": "STALE_VERSION" | "INVALID_TRANSITION" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND", "message": "..." } }
```
A consistent error code contract is itself worth mentioning in the interview — it's what lets the frontend show a *specific* conflict UI instead of a generic toast (see §11).

---

## 7. Feature specs (the 9 required stories)

For each story: what to build, what to test, one interview-ready sentence.

### Story 1 — Log in as a seeded user
- Simple login screen: pick/enter a seeded email → session set.
- Server derives identity from the cookie on **every** request; the client never sends a role.
- Test: hit a protected endpoint with no cookie → 401. Hit it with a viewer's cookie trying an author action → 403.
- *Interview line:* "The frontend never tells the server who the user is — the server reads it from a signed cookie, so there's no request I can forge from devtools that changes my role."

### Story 2 — Create a draft
- Form: title + body. Zod schema rejects empty/whitespace-only strings server-side (not just `required` in the HTML).
- On success: insert Document + one `CREATED` AuditEvent, same `prisma.$transaction`.
- Test: viewer gets 403; empty body gets 400; success produces exactly one audit row.

### Story 3 — Edit a draft
- Editable only when `status ∈ {DRAFT, REJECTED}` and `authorId === session.userId`.
- Requires `expectedVersion` in the body (see §8) — bump `version` and write an `EDITED` audit event with a diff-ish metadata blob (`{ titleChanged, bodyChanged }`) in one transaction.
- Test: editing a `SUBMITTED` doc → 403 with a clear "not editable in this state" message, not a silent 200.

### Story 4 — Submit for review
- `draft → submitted`, owner-only, empty body blocked (defense in depth even though creation already blocks it).
- Appears in reviewers' queue immediately (`GET /api/documents?status=SUBMITTED`).
- Author sees it as read-only once submitted (UI reads the same `can()` helper as the server).

### Story 5 — Review (approve/reject)
- Reviewer who is **not** the author can approve or reject.
- Reject requires non-empty comment, stored on the audit event.
- Rejected doc becomes editable by its author again (no separate "reopen" click required if you want to simplify — but the brief lists `reopen` as its own transition triggered by the author, so keep it as an explicit action: author reviews the rejection comment, then clicks "Reopen to edit," which does `rejected → draft`. This is more honest to the diagram and gives you a second thing to point at in the audit trail.)

### Story 6 — Publish
- `approved → published`, reviewer or admin.
- Published documents become visible on the public/viewer list; nothing else does.
- Add a route guard test: a viewer directly requesting `GET /api/documents/:id` for a `DRAFT` doc (guessed ID) → 404 (not 403 — don't even confirm the ID exists to an unauthorized viewer).

### Story 7 — Audit history
- Timeline per document: actor name, action, from→to status, comment (if any), timestamp.
- Every mutating endpoint's DB write and its audit insert happen inside one `prisma.$transaction([...])` call — never two separate `await`s that could leave one committed without the other.
- Test: force an error after the status update but before the audit insert (mock) and assert the transaction rolls back both.

### Story 8 — Concurrent updates (the one they call "Tuesday, not exotic")
- Every `Document` has a `version: Int`.
- Every mutation requires the client to send back the `version` it last read.
- Server logic:
  ```ts
  const result = await prisma.document.updateMany({
    where: { id, version: expectedVersion },
    data: { status: newStatus, version: { increment: 1 } },
  });
  if (result.count === 0) throw new ConflictError('STALE_VERSION');
  ```
  This is atomic — no separate read-then-write race window.
- UI: if a `409 STALE_VERSION` comes back, don't just show a toast — refetch the doc, show the current (real) state, and let the user re-decide. This is expanded into a real feature in §11.

### Story 9 — Archive
- Admin-only, from any of `draft/submitted/approved/published`.
- Archived docs excluded from all active queues/lists but remain fully queryable via history/detail routes for admins (and visible in the audit trail of anyone who could see them before).
- Not editable, not publishable. No hard delete anywhere in the app — enforced by simply never exposing a `DELETE` route.

---

## 8. Concurrency & transaction design (detail)

Two mechanisms, used together:

1. **Optimistic concurrency (`version` column)** — handles the "two people editing/transitioning the same doc" case from Story 8. Implemented as a single conditional `updateMany` (see above), which is safe under concurrent requests because Postgres evaluates the `WHERE` atomically per row — no explicit row lock needed for this pattern.
2. **DB transactions for state+audit pairing** — handles Story 7's requirement. Every mutation is:
   ```ts
   await prisma.$transaction(async (tx) => {
     const updated = await tx.document.updateMany({ where: { id, version: expectedVersion, status: fromStatus }, data: { status: toStatus, version: { increment: 1 } } });
     if (updated.count === 0) throw new ConflictError();
     await tx.auditEvent.create({ data: { documentId: id, actorId, action, fromStatus, toStatus, comment } });
   });
   ```
   Note the `WHERE` also pins `status: fromStatus` — this double-checks the transition is still legal at write time, not just at the moment the UI rendered the button (closes a second, subtler race: the state could have moved between two different valid transitions since the client last read it, even if the version happened to match — belt and suspenders).

---

## 9. Audit log design

- **Append-only.** No `PATCH`/`DELETE` route ever touches `AuditEvent`.
- One row per meaningful action, always inside the same transaction as the state change it describes.
- `metadata: Json?` lets you log extra context (e.g., which fields changed on an edit) without schema churn.
- Exposed via `GET /api/documents/:id/history`, rendered as a vertical timeline (see §11 for the visual treatment — this is a good place to add polish because it's cheap and it's exactly what the rubric is watching).

---

## 10. UI/UX direction — deliberately not "AI-generated-looking"

The brief says visual design isn't the primary grading axis, but a generic shadcn-purple-gradient-with-emoji dashboard is a visible tell that no thought went in. Do this instead:

- **Typography-led design, not card-soup.** Pick one serif for headings (e.g. "Fraunces" or "Source Serif 4") + one clean sans for body/UI (e.g. "Inter" or "IBM Plex Sans"). Documents are the product — treat the document title and body like editorial content, not a form field in a box.
- **A restrained, specific palette** — not default Tailwind slate/indigo. Pick 2 neutrals + 1 accent tied to status color-coding: e.g. warm off-white background, near-black text, and status colors that are muted, not traffic-light-bright (ochre for draft, dusty blue for submitted, sage for approved, terracotta for rejected, near-black for published, warm gray for archived).
- **The state machine is a first-class UI element**, not just a badge. On each document detail page, render a small horizontal stepper showing the actual path the doc can take next, greying out transitions the current user isn't allowed to trigger (using the same `can()` helper — see §5). This single component does double duty: it looks intentional, and it's a direct, visual answer to "does your UI understand the workflow" in an interview.
- **No dashboard-template chrome.** Skip the generic sidebar-with-icons-and-a-logo-placeholder look. A simple top nav (role badge + name + logout) is enough — the brief explicitly says a simple UI is fine.
- Use the `frontend-design` guidance during build for spacing/type-scale discipline so it doesn't drift into default-Tailwind look.

---

## 11. Differentiators — what makes this submission stand out

Everyone doing this challenge builds the same 9 stories. These are scoped to be small, each one directly deepens a rubric point (not scope creep), and each gives you a genuinely good interview answer.

**Pick 3–4, not all — the brief penalizes over-engineering. Ranked by effort-to-signal ratio:**

1. **Conflict-resolution screen instead of a generic error toast (extends Story 8).**
   When a `409 STALE_VERSION` comes back, don't just alert() — show a side-by-side: "Your view (stale)" vs "Current state," highlighting exactly what changed (status, and who changed it, pulled from the latest audit event), then let the user choose "Discard my action" or "Reload and retry." This turns the required concurrency handling into something you can actually demo live in an interview instead of describing in the abstract.
   *Effort: small (a modal + one extra fetch). Signal: directly on the rubric's own "handling of stale client state."*

2. **Postgres CHECK constraint as a second, DB-level line of defense.**
   In addition to the application-level transition table, add a raw SQL `CHECK` constraint (via a Prisma migration's raw SQL) on `Document.status` combined with a trigger — or, more simply and still legitimate, a **partial index** or migration comment documenting *why* you chose to enforce transitions in application code instead of a DB trigger, and what you'd change for a stricter production system (e.g. a Postgres enum-transition trigger, or an event-sourced model where the current status is *derived* from the audit log rather than stored redundantly).
   *Effort: small. Signal: directly on the rubric's "which invariants enforced by DB vs application code" question in the design note — shows you thought about it even if you chose not to fully implement it, which is an honest, senior-sounding answer.*

3. **"Reviewer queue with live presence" — a lightweight nod to real concurrency awareness.**
   When a reviewer opens a submitted document, write a short-lived `viewing` marker (in-memory map or a `lastSeenAt` timestamp on a tiny `Presence` table) and show "Carol is also viewing this document" if another reviewer has it open within the last 60 seconds. This is *not* a chat feature — it's a small, honest signal that makes the Bob/Carol scenario in Story 8 feel real instead of contrived, and it's genuinely simple to build (poll every 5s, no websockets required).
   *Effort: small–medium. Signal: makes concurrency tangible in a live demo; good "what I'd improve" pairing (swap polling for websockets in production).*

4. **Exportable audit trail (PDF or plain print-friendly view) for a published document.**
   A "Compliance export" button on any document that generates a clean, printable summary: title, current status, full audit timeline, and who approved/published it. This directly answers "why does an audit log matter" with a concrete artifact instead of just a database table — good for a BFSI-flavored interview story, given the domain (approval trails are exactly what regulated industries care about).
   *Effort: small if done as a print-stylesheet route (`/documents/:id/export`) rather than a real PDF library — explicitly avoid pulling in a heavy PDF pipeline, that's scope creep the brief warns against.*

5. **A tiny "what changed" diff view on the audit timeline for EDITED events.**
   Store a cheap `{ titleBefore, titleAfter }` style diff in the `metadata` JSON on edit events (not full versioning — just enough to show "title changed from X to Y" inline in the timeline). Cheap, and it's a nice concrete answer to "how do you keep audit events meaningful, not just a log of timestamps."

**Explicitly do NOT build (matches the brief's out-of-scope list, plus a few obvious traps):**
- Full document versioning / diffing library
- Real-time websockets (polling is enough and easier to explain correctly)
- Any file upload, rich text editor, real email, OAuth, complex admin analytics dashboard
- A generic "notifications" system beyond what's needed for the reviewer queue

---

## 12. Testing plan

Use Vitest + a test Postgres DB (docker-compose, separate from dev DB), integration-style — call the actual route handlers, not just unit-test the pure functions in isolation (though also unit-test `assertValidTransition` and `can()` directly, they're cheap and high value).

Minimum required coverage (mirrors the rubric's red flags directly):
- [ ] Unauthenticated request to any mutating route → 401
- [ ] Wrong-role request (e.g. viewer tries to create) → 403
- [ ] Every *invalid* transition in the state diagram (e.g. `draft → approved`) → 400/403, not a silent success
- [ ] Reviewer approving their own document → 403
- [ ] Reject without a comment → 400
- [ ] Publish a non-approved document → 400
- [ ] Two concurrent requests with the same starting `version`, only one should succeed, the other gets `409`
- [ ] Every successful mutation produces exactly one matching `AuditEvent` in the same transaction (simulate a failure mid-transaction and assert full rollback)
- [ ] Viewer requesting a non-published document by guessed ID → 404, not 200 or 403-with-details

---

## 13. DESIGN.md — required deliverable (template to fill in after building)

```markdown
# Design Note

## Most important invariants
1. A document's status can only change via the transitions in the state machine — enforced in one place (`lib/workflow.ts`), never duplicated.
2. Every status change and its audit event commit atomically or not at all.
3. A stale client can never silently overwrite a newer state (optimistic concurrency via `version`).
4. A reviewer can never approve/reject their own document.
5. Published is the only status visible to viewers; nothing else has any code path to them.

## DB vs application-code invariants
- DB enforces: column types/enums, non-null constraints, uniqueness (email), foreign keys.
- Application enforces: transition legality, role checks, ownership checks, comment-required-on-reject.
- [Explain here why you drew the line here, and what you'd move into the DB for a stricter production system — e.g. a transition-check trigger, or deriving status from the audit log instead of storing it.]

## Permissions
[Describe the can() helper and that both UI and API call the same function.]

## Preventing stale/conflicting updates
[Describe the version column + conditional updateMany + the conflict-resolution UI.]

## Keeping audit events consistent
[Describe the $transaction wrapping every mutation.]

## Failure cases considered
[List: DB down mid-transaction, concurrent transitions, double-submit from a slow network retry, guessed IDs, expired/tampered session cookie, etc.]

## What I'd improve with more time
[Be honest — e.g. real-time presence via websockets instead of polling, a proper migration-based DB trigger for transitions, rate limiting, structured logging.]

## What would need to change for production
[Real auth provider, deployment, observability, rate limiting, backups, horizontal scaling of the presence feature, etc.]

## Optional: something learned outside the usual web stack
[Fill in honestly if applicable — don't fabricate one just to fill the section.]
```

---

## 14. Folder structure & build order

```
/prisma
  schema.prisma
  seed.ts
/app
  /api
    /login, /logout, /me
    /documents
      route.ts               (GET list, POST create)
      /[id]
        route.ts              (GET one, PATCH edit)
        /submit, /approve, /reject, /reopen, /publish, /archive, /history
  /login
  /documents
    page.tsx                  (list / queue, role-aware)
    /[id]/page.tsx             (detail + stepper + timeline + actions)
    /new/page.tsx
/lib
  workflow.ts                 (transition table + assertValidTransition)
  permissions.ts               (can())
  session.ts
  db.ts
  errors.ts
/components
  StatusStepper.tsx
  AuditTimeline.tsx
  ConflictModal.tsx
  DocumentForm.tsx
/tests
  workflow.test.ts
  permissions.test.ts
  api.documents.test.ts
README.md
DESIGN.md
```

**Recommended build order** (front-load the parts the rubric weighs most):
1. Prisma schema + migration + seed data
2. `lib/workflow.ts` + `lib/permissions.ts` + unit tests for both — this is the spine, get it right before any UI exists
3. Auth (login/logout/me) + session
4. Create + edit + list documents (Story 2, 3) with Zod validation
5. Submit/approve/reject/reopen/publish/archive routes, each wrapped in `$transaction`, each audited
6. Concurrency: add `version` handling to every mutation + the conflict modal (Story 8 + Differentiator #1)
7. Audit timeline UI (Story 7)
8. UI pass: stepper component, typography/palette (§10)
9. Differentiators #2–#5 (pick 3–4) — only after 1–8 are solid
10. Integration tests (§12)
11. README + DESIGN.md
12. Final pass: try every red-flag scenario yourself as if you were the evaluator

---

## 15. Submission checklist (mirrors ElevateBox's own rubric, 1:1)

- [ ] Correctness of workflow rules — every transition in §4 enforced, every non-transition rejected
- [ ] Server-side authorization on every route (never UI-only)
- [ ] Clean data model (§3) with real relations, not stringly-typed status
- [ ] Every mutation wrapped in a DB transaction with its audit event
- [ ] Audit log is append-only, chronological, complete
- [ ] Stale writes rejected via version-based optimistic concurrency, with a real conflict UX
- [ ] TypeScript strict mode, no `any` leaking into route handlers
- [ ] UI clarity — simple, intentional, not a generic template (§10)
- [ ] Code organized so `lib/workflow.ts` and `lib/permissions.ts` are the obvious single sources of truth
- [ ] Can explain every design choice without an AI agent present, per ElevateBox's own AI policy
- [ ] README: setup, env vars, how to run, how to run tests, seeded logins
- [ ] DESIGN.md filled in honestly, including a real "what I'd improve"
- [ ] Repo is public and runnable by someone not logged in as you (test this literally, in an incognito clone)

---

## 16. README.md template + Git/GitHub automation instructions for Antigravity

### 16.1 Instructions to Antigravity: repo setup and push

> **Agent instructions — do this at the very start of the build, before writing feature code, and again after each milestone in §14's build order:**
>
> 1. GitHub profile URL will be provided by the user (e.g. `https://github.com/<username>`). Derive `<username>` from it.
> 2. Initialize git in the project root: `git init -b main`.
> 3. Create a `.gitignore` covering at minimum: `node_modules/`, `.env`, `.env.local`, `.next/`, `dist/`, `*.log`, `.DS_Store`.
> 4. Create the repository on GitHub under that username using the GitHub CLI: `gh repo create <username>/elevatebox-document-approval-system --public --source=. --remote=origin`. If `gh` is not authenticated in this environment, instead print clear manual instructions for the user: create an empty public repo named `elevatebox-document-approval-system` on github.com, then run `git remote add origin https://github.com/<username>/elevatebox-document-approval-system.git`.
> 5. **Do not commit `.env` or any real secrets.** Only commit `.env.example` with placeholder values (see §16.2).
> 6. Commit in small, meaningful, story-scoped chunks — not one giant commit — following this sequence, matching §14's build order:
>    - `chore: project scaffold, prisma schema, seed data`
>    - `feat: auth (seeded login, session cookie, /api/me)`
>    - `feat: workflow state machine + permission helper (lib/workflow.ts, lib/permissions.ts)`
>    - `feat: create and edit draft documents (story 2, 3)`
>    - `feat: submit for review (story 4)`
>    - `feat: reviewer approve/reject with audit transaction (story 5)`
>    - `feat: publish approved documents (story 6)`
>    - `feat: audit history timeline (story 7)`
>    - `feat: optimistic concurrency + conflict resolution UI (story 8)`
>    - `feat: archive documents (story 9)`
>    - `feat: differentiators - conflict modal, presence indicator, compliance export`
>    - `test: integration tests for permissions, transitions, concurrency`
>    - `docs: README and DESIGN.md`
> 7. After each commit, `git push origin main`. Do not wait until the very end to push — the repo should be inspectable mid-build, which also protects the user against losing work.
> 8. At the end, verify the deliverable by cloning the repo fresh into a temp directory and following the README's own setup steps exactly, with no prior context — this is the same test ElevateBox will run.

### 16.2 README.md template (fill in placeholders, then commit as-is)

```markdown
# Controlled Document Approval System

A small, correctness-first document approval workflow built for the ElevateBox engineering
challenge: a document can never be published unless the right person approved it, and every
important action is recorded in an audit log.

## Tech stack
- Next.js 14 (App Router) + TypeScript (strict)
- PostgreSQL + Prisma
- Zod for server-side validation
- Vitest for integration tests
- Tailwind CSS

## Setup

### 1. Prerequisites
- Node.js 20+
- Docker (for local Postgres) — or a Postgres connection string from Supabase/Neon/etc.

### 2. Install
\`\`\`bash
git clone https://github.com/<username>/elevatebox-document-approval-system.git
cd elevatebox-document-approval-system
npm install
\`\`\`

### 3. Environment variables
Copy the example file and fill in real values:
\`\`\`bash
cp .env.example .env
\`\`\`

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql://postgres:postgres@localhost:5432/elevatebox` |
| `SESSION_SECRET` | Random string used to sign session cookies | generate with `openssl rand -base64 32` |

### 4. Start Postgres locally (skip if using a hosted DB)
\`\`\`bash
docker compose up -d
\`\`\`

### 5. Run migrations and seed data
\`\`\`bash
npx prisma migrate dev
npx prisma db seed
\`\`\`

### 6. Run the app
\`\`\`bash
npm run dev
\`\`\`
Visit http://localhost:3000

### 7. Run tests
\`\`\`bash
npm test
\`\`\`
Tests run against a separate test database — see `DATABASE_URL_TEST` in `.env.example`.

## Seeded logins
No passwords — this app uses seeded users and a simple session for the purpose of this
challenge (production auth is explicitly out of scope). Log in by selecting/entering one of
these emails on the login screen:

| Email | Role |
|---|---|
| alice@example.com | Author |
| bob@example.com | Reviewer |
| carol@example.com | Reviewer |
| admin@example.com | Admin |
| viewer@example.com | Viewer |

## Project structure
See `PRD.md` / `DESIGN.md` for the full architecture, state machine, and design rationale.

## Design note
See [`DESIGN.md`](./DESIGN.md) for invariants, permission model, concurrency handling, audit
log design, failure cases considered, and what I'd improve with more time.

## Demoing the concurrency scenario (Story 8)
1. Log in as `bob@example.com` in one browser (or incognito window), open a submitted document.
2. Log in as `carol@example.com` in another, open the same document.
3. As Bob, approve it.
4. As Carol, try to reject it — you'll see a conflict screen showing the document has already
   moved to `approved` by Bob, instead of silently overwriting it.
```

### 16.3 `.env.example` to commit alongside the README

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/elevatebox"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/elevatebox_test"
SESSION_SECRET="replace-with-output-of-openssl-rand-base64-32"
```
