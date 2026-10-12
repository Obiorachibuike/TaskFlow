# TaskFlow

**Plan smarter. Build faster. Ship together.**

TaskFlow is an AI-powered project management workspace for software teams — workspaces,
projects, issues, Kanban boards, sprints, backlogs, reports, notifications, and an AI
assistant, with server-enforced permissions on every action and strict workspace isolation.

> Original product and visual identity. Functionality inspired by the project-management
> category (epics, sprints, boards, burndowns) — no third-party branding, assets, or code.

---

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js (App Router), React, strict TypeScript |
| UI | Tailwind CSS, shadcn/ui-style components, Lucide icons, Recharts, dnd-kit |
| API / realtime | Next.js route handlers + custom `server.ts` (Next + Socket.IO + job scheduler) |
| Database | PostgreSQL + Prisma (hand-authored SQL migrations) |
| Auth | Auth.js (Google OAuth + email/password, verification, password reset) |
| Validation | Zod (every request), React Hook Form on the client |
| Email | Resend (console transport fallback in dev) |
| Storage | Local disk or S3-compatible (attachments) |
| AI | Provider abstraction (OpenAI-compatible or Anthropic), zod-validated output |
| Tests | Vitest (unit + DB integration), Playwright specs (see Testing) |

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#    set DATABASE_URL and AUTH_SECRET at minimum (openssl rand -base64 32)

# 3. Start PostgreSQL — either your own, or the embedded dev server:
npm run db:embedded -- init
npm run db:embedded -- start

# 4. Migrate and (optionally) seed DEV-only demo data
npm run db:migrate
npm run db:seed        # demo@taskflow.dev / demo1234 — never use in production

# 5. Run (custom server: Next + Socket.IO + job scheduler)
npm run dev            # http://localhost:3000
```

Production build:

```bash
npm run build
npm start              # runs `node server.js`-equivalent via tsx server.ts
```

## Feature map

- **Workspaces & RBAC** — Owner / Admin / Project Manager / Developer / Viewer with a
  server-enforced permission matrix (`src/lib/auth/permissions.ts`); invitations with
  hashed, expiring tokens; re-invite revokes prior pending invites; ownership transfer
  requires typing `TRANSFER`.
- **Projects** — unique human key (`NOVA`), icon, color, status, dates, lead, members,
  per-project issue counters and configurable board columns.
- **Issues** — Epic/Story/Task/Bug/Subtask, keys like `NOVA-104` generated atomically
  (`UPDATE … RETURNING`, safe under concurrency), CRUD, duplicate, comments, subtasks,
  dependencies, labels, attachments, bulk operations, soft delete, full-text filters.
- **Board** — Kanban with configurable columns, fractional-rank drag & drop (dnd-kit),
  inline create, side panel, optimistic UI that rolls back when the write fails.
- **Sprints** — goals, dates, planning, start/complete with validated state transitions
  (PLANNED → ACTIVE → COMPLETED), carry-forward of unfinished work, sprint snapshots.
- **Reports** — burndown, velocity, project metrics — all computed from persisted
  issue + activity records only (definitions in [docs/METRICS.md](docs/METRICS.md)).
- **Notifications** — durable DB-backed (mentions, assignments, status changes, due
  dates) with per-user preferences; never notifies you about your own actions.
- **Real-time** — authenticated Socket.IO, membership-checked workspace/project rooms,
  backed by an in-process event bus (see Real-time architecture).
- **AI assistant** — 9 capabilities behind a provider abstraction; every response is
  zod-validated; **no record is ever mutated without explicit user confirmation**;
  prompt content is treated as untrusted data; per-user rate limits; graceful disabled
  state with a setup message when credentials are missing.
- **GitHub integration** — repo connection, branch/PR/commit references via issue-key
  extraction, HMAC-verified webhooks (`X-Hub-Signature-256`), encrypted token storage.
  Setup guide: [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md).

## Navigation

Overview · My Tasks · Projects · Boards · Backlog · Sprints · Calendar · Timeline ·
Reports · AI Assistant · Integrations · Settings — plus workspace switcher, global
search, create button, notification bell, user menu, and breadcrumbs.

## RBAC matrix (summary)

| Capability | Owner | Admin | PM | Developer | Viewer |
| --- | :-: | :-: | :-: | :-: | :-: |
| Manage workspace / transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite / remove members, change roles | ✅ | ✅* | ❌ | ❌ | ❌ |
| Create / edit / delete projects | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create / edit issues, comment | ✅ | ✅ | ✅ | ✅ | ❌ |
| Change status/priority/assignees | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete issues | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage sprints (start/complete) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Read everything in workspace | ✅ | ✅ | ✅ | ✅ | ✅ |

\* Admins cannot demote other admins or remove the owner. The full matrix lives in
`src/lib/auth/permissions.ts` and is enforced in service layer — never in the UI alone.

## Security model

- **Server-enforced authorization** on every API route and service function
  (`requireWorkspaceMembership` → `requirePermission`); denied requests fail closed.
- **Workspace isolation**: foreign IDs resolve to `NOT_FOUND` (existence-concealing),
  proven by integration tests and HTTP smoke tests.
- **Mass-assignment protection**: every request body is parsed with a strict zod schema;
  unknown keys are stripped before touching Prisma.
- **Secrets**: passwords (scrypt), verification/reset/invite tokens (sha256-hashed at
  rest), integration tokens (AES-256-GCM). No secrets in client code or the repo.
- **Webhooks**: HMAC-SHA256 signature verification over the raw body, delivery-ID
  deduplication, and issue-key extraction from untrusted text (never marks issues done).
- **Attachments**: MIME allowlist, size caps, randomized storage keys, and a membership
  check before any file is served.
- **AI prompts**: untrusted content is wrapped in `<data>` blocks with an explicit
  ignore-embedded-instructions policy; outputs are schema-validated before display.

## Testing

```bash
npx vitest run     # unit + DB-integration suite (needs PostgreSQL; test DB auto-created)
npm run lint       # ESLint (flat config, next/core-web-vitals + next/typescript)
npx tsc --noEmit   # strict typecheck
npm run build      # production build
```

The Vitest suite covers: RBAC matrix enforcement, workspace isolation, password/token
cryptography, webhook signature verification, validation schemas, AI output validation,
issue-key generation under concurrency, board ordering, sprint transitions, notification
preferences, due-date reminders, and burndown/velocity computation.

Playwright end-to-end specs live in `e2e/`. Browser binaries could not be downloaded in
the authoring environment (CDN not allowlisted), so **e2e is authored but not executed** —
run `npx playwright install && npx playwright test` on a machine with browser access.

## Real-time architecture

`server.ts` boots Next.js and attaches Socket.IO on the same HTTP server. Sockets
authenticate from the session JWT (never accept an unauthenticated subscription) and are
admitted only to rooms for workspaces/projects where the user is a member at join time.
Service mutations publish to an in-process `realtimeBus`, which bridges to sockets.

For multi-node deployments you must swap the in-process bus for a Redis-backed adapter
(Socket.IO `@socket.io/redis-adapter` + a pub/sub bus) and move scheduled jobs to BullMQ
with `REDIS_URL` set — the in-process queue is single-node only. This is called out in
[DEPLOYMENT.md](DEPLOYMENT.md).

## Migrations

SQL migrations live in `prisma/migrations/<name>/migration.sql` and are applied by
`npm run db:migrate` (custom runner, tracks applied names in `_taskflow_migrations`) or
by `prisma migrate deploy` where the Prisma schema engine is available.

## Environment

All variables are documented in [.env.example](.env.example). Highlights:

| Variable | Required | Purpose |
| --- | :-: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `AUTH_SECRET` | ✅ | Session JWT signing key |
| `APP_URL` | ✅ | Canonical URL for emails/OAuth redirects |
| `GOOGLE_CLIENT_ID/SECRET` | | Google sign-in |
| `RESEND_API_KEY` / `EMAIL_FROM` | | Transactional email (console fallback in dev) |
| `AI_PROVIDER` + `AI_API_KEY` or `ANTHROPIC_API_KEY` | | AI assistant |
| `GITHUB_CLIENT_ID/SECRET`, `GITHUB_WEBHOOK_SECRET`, `INTEGRATION_ENCRYPTION_KEY` | | GitHub integration |
| `REDIS_URL` | | Multi-node realtime/jobs |
| `STORAGE_DRIVER`, `S3_*` | | Attachment storage |

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment guide
- [docs/METRICS.md](docs/METRICS.md) — report/metric definitions
- [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md) — GitHub integration setup

## Known limitations

- In-process job queue and event bus are single-node; use Redis/BullMQ for horizontal scale.
- Playwright specs are authored but were not executed in the build environment (no browsers).
- AI and GitHub integrations require real credentials; without them the app reports an
  explicit disabled/unconfigured state and never simulates success.
- Calendar/timeline views cover milestones and dates at the workspace/project level.
