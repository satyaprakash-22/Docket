# Docket

**A correctness-first document approval workflow.**
A document can never be published unless the right person approved it, and every important action is recorded in an audit log — enforced entirely on the server, never just in the UI.

Built for the ElevateBox Engineering Challenge (*Controlled Document Approval System*).

- **Author:** Satya Prakash
- **Repo:** https://github.com/satyaprakash-22/docket
- **Full spec:** [`PRD.md`](./PRD.md) · **Design rationale:** [`DESIGN.md`](./DESIGN.md) · **Build log:** [`PROGRESS.md`](./PROGRESS.md)

---

## Table of contents

- [What this is](#what-this-is)
- [Tech stack](#tech-stack)
- [The workflow](#the-workflow)
- [Roles and permissions](#roles-and-permissions)
- [Setup](#setup)
- [Seeded logins](#seeded-logins)
- [Running tests](#running-tests)
- [Feature walkthrough](#feature-walkthrough)
- [Concurrency handling — the core of the challenge](#concurrency-handling--the-core-of-the-challenge)
- [Audit log design](#audit-log-design)
- [Differentiators](#differentiators)
- [Project structure](#project-structure)
- [Design note](#design-note)

---

## What this is

Real systems aren't defined by their happy path — they're defined by what they **refuse to do**. This app is built around that idea. Every feature exists to either move a document forward through a controlled lifecycle, or to correctly block an action that shouldn't be allowed: the wrong person publishing, a stale browser tab silently overwriting a newer change, a status flipping with no record of who did it.

There are exactly two pieces of logic that decide almost everything in this codebase:
- **`lib/workflow.ts`** — a single transition table that knows every legal document status change and who's allowed to trigger it.
- **`lib/permissions.ts`** — a single `can()` function that both the UI and every API route call, so there's no drift between what a button hides and what the server actually enforces.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript, strict mode |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod (server-side, on every mutation) |
| Auth | Seeded users + signed `iron-session` httpOnly cookie |
| Styling | Tailwind CSS + hand-tuned design tokens (Fraunces serif + Inter sans, restrained warm palette) |
| Testing | Vitest (integration-style, against real permission/workflow logic) |

No signup flow, password reset, email sending, OAuth, file upload, or rich-text editor — deliberately out of scope, matching the challenge brief.

---

## The workflow

```
draft ──submit──▶ submitted ──approve──▶ approved ──publish──▶ published
  ▲                    │
  │                 reject (comment required)
  └──reopen───────── rejected

admin can archive from: draft, submitted, approved, published ──▶ archived (terminal)
```

Any move that isn't one of these arrows is rejected by the server with a `400 INVALID_TRANSITION` — never silently ignored, never allowed through because the UI happened to show a button.

---

## Roles and permissions

| Action | Viewer | Author (own) | Reviewer | Admin |
|---|:---:|:---:|:---:|:---:|
| View published docs | ✅ | ✅ | ✅ | ✅ |
| View draft/submitted/approved/rejected | ❌ | ✅ (own only) | ✅ (queue) | ✅ |
| Create document | ❌ | ✅ | ❌ | ❌ |
| Edit document | ❌ | ✅ (draft/rejected only) | ❌ | ❌ |
| Submit for review | ❌ | ✅ | ❌ | ❌ |
| Approve / reject | ❌ | ❌ (never own) | ✅ (never own) | ❌ |
| Publish | ❌ | ❌ | ✅ | ✅ |
| Archive | ❌ | ❌ | ❌ | ✅ |

A reviewer can never approve or reject a document they authored themselves — checked with `document.authorId !== session.userId`, independently of the role check.

---

## Setup

### Prerequisites
- Node.js 20+
- Docker (for local Postgres) — or any Postgres connection string (Supabase, Neon, etc.)

### 1. Install
```bash
git clone https://github.com/satyaprakash-22/docket.git
cd docket
npm install
```

### 2. Environment variables
```bash
cp .env.example .env
```

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql://postgres:postgres@localhost:5432/docket` |
| `DATABASE_URL_TEST` | Separate DB used only by the test suite | `postgresql://postgres:postgres@localhost:5432/docket_test` |
| `SESSION_SECRET` | Random string used to sign the session cookie | generate with `openssl rand -base64 32` |

### 3. Start Postgres locally
```bash
docker compose up -d
```

### 4. Run migrations and seed data
```bash
npx prisma db push
npx prisma db seed
```

### 5. Run the app
```bash
npm run dev
```
Visit **http://localhost:3000**

---

## Seeded logins

No passwords — this app uses seeded users with a simple signed-cookie session, per the challenge's explicit scope. Log in by entering one of these emails on the login screen:

| Persona | Email | Role | Can do |
|---|---|---|---|
| Alice Author | `alice@example.com` | Author | Create, edit, submit, and reopen her own documents |
| Bob Reviewer | `bob@example.com` | Reviewer | Approve/reject submitted docs (not his own), publish approved docs |
| Carol Reviewer | `carol@example.com` | Reviewer | Second reviewer persona — used to demo the concurrency scenario below |
| Aman Admin | `admin@example.com` | Admin | Full visibility, publish, and archive from any active state |
| Vikram Viewer | `viewer@example.com` | Viewer | Read-only access to published documents only |

---

## Running tests

```bash
npm test
```

Covers the two pieces of logic the whole app depends on:
- `tests/workflow.test.ts` — every legal transition succeeds, every illegal one throws `WorkflowError` (400) or `ForbiddenError` (403), including role-specific denials.
- `tests/permissions.test.ts` — the full role × ownership × status matrix, with a dedicated test for self-approval protection (a reviewer can never approve/reject their own document).

---

## Feature walkthrough

1. **Log in as a seeded user.** The server derives identity and role from a signed httpOnly cookie on every request — the client never sends a role, so there's no request that can be forged from devtools to escalate permissions.
2. **Create a draft.** Author-only, title and body are validated server-side with Zod (not just an HTML `required` attribute). Creation writes one audit event in the same transaction as the insert.
3. **Edit a draft.** Owner-only, and only while the document is `draft` or `rejected`. Requires an `expectedVersion` so a stale edit can never silently overwrite a newer one.
4. **Submit for review.** `draft → submitted`, owner-only. The document becomes read-only to its author and appears in the reviewer queue.
5. **Review.** A reviewer who isn't the author can approve or reject. Rejecting requires a non-empty comment, enforced server-side.
6. **Publish.** `approved → published`, by a reviewer or admin. Before this point, a viewer requesting the document directly — even guessing the ID — gets a plain `404`, never a `403` that would confirm the document exists.
7. **View audit history.** Every document has a full, append-only timeline: who did what, when, and the before/after status. State changes and their audit event are written in one database transaction — there is no path where one exists without the other.
8. **Concurrent updates.** See the dedicated section below — this is the centerpiece of the challenge.
9. **Archive.** Admin-only, from any active state. Nothing is ever hard-deleted; archived documents remain fully queryable, just pulled out of active workflow queues.

---

## Concurrency handling — the core of the challenge

Every document carries a `version` integer. Every mutation sends back the version the client last read. The server applies it as a single conditional update:

```ts
const result = await tx.document.updateMany({
  where: { id, version: expectedVersion, status: currentStatus },
  data: { status: newStatus, version: { increment: 1 } },
});
if (result.count === 0) throw new ConflictError(); // 409 STALE_VERSION
```

This is atomic — there's no separate read-then-write window where two requests could race.

**Try it yourself:**
1. Log in as `bob@example.com` in one browser (or an incognito window), open a submitted document.
2. Log in as `carol@example.com` in another, open the same document — you'll see a live "Carol is also viewing this document" presence indicator on Bob's screen within a few seconds.
3. As Bob, approve it.
4. As Carol, try to reject it (still on her now-stale page).
5. Carol doesn't get a silent failure or an overwrite — she gets a side-by-side **conflict resolution screen** showing her stale view next to the real current state ("Bob approved this document"), and can choose to reload or discard her action.

---

## Audit log design

- **Append-only.** `AuditEvent` has no update or delete route anywhere in the app.
- **Atomic with its state change.** Every mutation wraps the document update and the audit insert in one `prisma.$transaction` — if one fails, both roll back.
- **Rich enough to be useful, not just a timestamp log.** Rejection comments are stored on the event; edits store a `{ titleBefore, titleAfter }` diff in a JSON metadata column, rendered inline on the timeline.

---

## Differentiators

Beyond the nine required stories, a few small additions that go past the base rubric — each chosen because it deepens a specific grading criterion rather than adding unrelated scope:

1. **Conflict-resolution modal** instead of a generic error toast for `409 STALE_VERSION` — turns the required concurrency handling into something demoable, not just describable.
2. **Reviewer live presence indicator** ("Carol is also viewing this document"), polled every 5 seconds — makes the two-reviewer race condition feel real instead of contrived.
3. **Inline diff view** on edit events in the audit timeline, showing exactly what changed.
4. **Printable compliance export** (`/documents/:id/export`) — a clean audit summary of a document's full approval trail, useful in regulated/BFSI-style contexts.

---

## Project structure

```
/prisma
  schema.prisma          # User, Document, AuditEvent, Presence models + enums
  seed.ts                 # 5 seeded personas
/app
  /api                    # Every mutating and read route, one per action
  /login, /documents       # Pages
/lib
  workflow.ts              # The state machine — single source of truth for transitions
  permissions.ts            # can() — single source of truth for who can do what
  session.ts                # Signed cookie session handling
  errors.ts                  # Typed error classes → consistent { error: { code, message } } shape
/components
  StatusStepper, AuditTimeline, ConflictModal, PresenceIndicator, DocumentForm, NavBar
/tests
  workflow.test.ts, permissions.test.ts
```

---

## Design note

See [`DESIGN.md`](./DESIGN.md) for the full breakdown of invariants, what's enforced by the database vs. application code, the permission model, failure cases considered, and what I'd improve with more time.

See [`PRD.md`](./PRD.md) for the complete original specification this project was built against.
