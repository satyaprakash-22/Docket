# Controlled Document Approval System

A small, correctness-first document approval workflow built for the ElevateBox engineering
challenge: a document can never be published unless the right person approved it, and every
important action is recorded in an audit log.

## Author & Repo
- **Author:** Satya Prakash
- **GitHub Repo:** [https://github.com/satyaprakash-22/elevatebox-document-approval-system](https://github.com/satyaprakash-22/elevatebox-document-approval-system)

---

## Tech Stack
- **Next.js 14+ (App Router)** + TypeScript (strict)
- **PostgreSQL** + **Prisma**
- **Zod** for server-side validation
- **Vitest** for unit & workflow integration tests
- **Tailwind CSS** + Hand-tuned design system tokens

---

## Key Correctness Invariants
1. **Centralized State Machine:** Implemented as a single pure function in [`lib/workflow.ts`](./lib/workflow.ts). No scattered `if` checks.
2. **Atomic State & Audit Writes:** Every document mutation is wrapped in a `prisma.$transaction` with an append-only `AuditEvent`.
3. **Optimistic Concurrency Protection:** Uses a `version` token on every mutation to block stale concurrent edits (`409 STALE_VERSION`).
4. **Self-Approval Protection:** Reviewers are strictly forbidden from approving or rejecting documents they authored (`lib/permissions.ts`).
5. **Role Visibility Guards:** Unauthorized roles receive `404 Not Found` for non-published documents to prevent information disclosure.

---

## Setup & Running Locally

### 1. Prerequisites
- Node.js 20+
- Docker (for local Postgres) — or a Postgres connection string from Supabase/Neon/etc.

### 2. Install Dependencies
```bash
git clone https://github.com/satyaprakash-22/elevatebox-document-approval-system.git
cd elevatebox-document-approval-system
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Environment variables:
- `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/elevatebox"`
- `SESSION_SECRET="dev-secret-change-in-production-use-openssl-rand-base64-32"`

### 4. Start Local Postgres Database
```bash
docker compose up -d
```

### 5. Run Migrations & Seed Data
```bash
npx prisma db push
npx prisma db seed
```

### 6. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Seeded Logins (No Passwords Required)
Log in by selecting or entering one of these seeded emails:

| Persona | Email | Role | Scope of Access |
|---|---|---|---|
| **Alice Author** | `alice@example.com` | `AUTHOR` | Create drafts, edit own drafts/rejected docs, submit for review, reopen rejected docs |
| **Bob Reviewer** | `bob@example.com` | `REVIEWER` | Approve/reject submitted docs (not own), publish approved docs |
| **Carol Reviewer** | `carol@example.com` | `REVIEWER` | Second reviewer persona for testing live concurrency |
| **Aman Admin** | `admin@example.com` | `ADMIN` | Full visibility, publish approved docs, archive active docs |
| **Vikram Viewer** | `viewer@example.com` | `VIEWER` | Read-only access to published documents only |

---

## Running Tests
Run the unit test suite covering state machine transitions, role permissions, and self-approval protection:
```bash
npm test
```

---

## Demoing Concurrency (Story 8 / Differentiator #1)
1. Open one browser window (or Incognito) and log in as `bob@example.com`. Open a submitted document.
2. Open another browser window and log in as `carol@example.com`. Open the exact same document.
3. In Carol's window, click **Approve Document**.
4. In Bob's window (which still holds the stale version v1), click **Reject Document**.
5. **Result:** Bob's request is rejected with `409 STALE_VERSION` and an interactive side-by-side **Conflict Resolution Modal** appears, showing that Carol already approved the document at that timestamp!

---

## Deliverables & Architecture Documentation
- [`DESIGN.md`](./DESIGN.md) — Complete design note detailing DB vs app invariants, permission model, failure cases, and production readiness.
- [`PRD.md`](../PRD.md) — Single source of truth specifications document.
- [`PROGRESS.md`](./PROGRESS.md) — Milestone tracking log.
