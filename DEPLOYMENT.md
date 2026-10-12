# Deploying TaskFlow

TaskFlow is a standard Next.js app with a custom Node server (`server.ts`) that also
hosts Socket.IO and the background job scheduler. Deploy it as a single Node process
(stateless, with PostgreSQL), or adapt the notes at the end for multi-node.

## 1. Prerequisites

- Node.js 20+
- PostgreSQL 14+ (managed: Neon, RDS, Cloud SQL, Supabase …)
- Optional: Redis (required only for multi-node realtime/jobs), S3 bucket (or use local disk),
  Resend account, OpenAI/Anthropic API key, GitHub OAuth app + webhook secret

## 2. Build

```bash
npm ci
npm run build
```

`npm run build` runs `prisma generate` first (postinstall also generates). Migrations are
SQL files under `prisma/migrations/` — apply them at deploy time (step 4).

## 3. Environment

Copy `.env.example` and set, at minimum:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/taskflow?schema=public
AUTH_SECRET=<openssl rand -base64 32>
APP_URL=https://taskflow.example.com
AUTH_TRUST_HOST=1
```

Production checklist (all documented in `.env.example`):

| Area | Variables | If missing |
| --- | --- | --- |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Emails log to stdout (fine for smoke, not for prod) |
| Google OAuth | `GOOGLE_CLIENT_ID/SECRET` | Only email/password auth is offered |
| AI | `AI_PROVIDER`, `AI_API_KEY` or `ANTHROPIC_API_KEY` | Assistant shows an explicit "not configured" state |
| GitHub | `GITHUB_CLIENT_ID/SECRET`, `GITHUB_WEBHOOK_SECRET`, `INTEGRATION_ENCRYPTION_KEY` | Integration page shows setup guidance; webhooks rejected |
| Storage | `STORAGE_DRIVER=s3` + `S3_*` | Local disk under `LOCAL_STORAGE_DIR` (not durable across deploys) |
| Jobs | `REDIS_URL` | In-process scheduler (single node only) |
| Uploads | `MAX_UPLOAD_BYTES` | Default 10 MB |

**Never commit `.env`.** Rotate `AUTH_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, and any API
keys if they ever leak; token material is encrypted with AES-256-GCM using
`INTEGRATION_ENCRYPTION_KEY`, so rotating that key invalidates stored GitHub tokens.

## 4. Database

Apply migrations before (or as part of) boot:

```bash
npx tsx scripts/migrate.ts      # applies pending SQL migrations, tracks in _taskflow_migrations
# or, where the Prisma schema engine is available:
npx prisma migrate deploy
```

Do **not** run `npm run db:seed` in production — it creates demo data
(demo@taskflow.dev). It is development-only.

## 5. Start

```bash
npm start        # tsx server.ts — Next.js + Socket.IO + job scheduler on PORT (default 3000)
```

Serve it behind a TLS-terminating proxy (Caddy, nginx, a load balancer). Requirements:

- WebSocket upgrade passthrough to the Node process (Socket.IO path `SOCKET_PATH`, default `/socket.io`)
- Forward `X-Forwarded-Proto` / `X-Forwarded-For` (set `AUTH_TRUST_HOST=1`)
- `APP_URL` must match the public origin (used in email links and OAuth redirects)

Health check: `GET /` (200) and `GET /api/auth/providers` (200).

## 6. Background jobs

`server.ts` registers scheduled jobs (due-date reminders) every
`JOB_SCHEDULER_INTERVAL_MS` (set `0` to disable). With a single Node process this is
safe. If you run **multiple replicas**, each replica would schedule duplicates — either:

- run exactly one replica with `JOB_SCHEDULER_INTERVAL_MS>0` and the rest with `0`, or
- move jobs to BullMQ with `REDIS_URL` set (queue code is isolated in `src/lib/jobs/`).

## 7. Multi-node realtime

The in-process `realtimeBus` only reaches sockets on the same node. For N>1:

1. Set `REDIS_URL` and install `@socket.io/redis-adapter`; attach it in `server.ts`
   alongside the existing Socket.IO instance.
2. Replace `realtimeBus.publish` fan-out with a Redis pub/sub bridge (the bus interface
   is intentionally tiny — `src/lib/realtime/bus.ts`).
3. Move scheduled jobs to BullMQ (see above).

Session state is JWT cookies + PostgreSQL — no sticky sessions required once realtime is
Redis-backed.

## 8. Platform notes

- **Vercel/Netlify/serverless**: not a fit as-is — Socket.IO and the scheduler need a
  long-lived Node server. Use Railway, Render, Fly.io, ECS/Fargate, Cloud Run
  (with min-instances ≥ 1 and CPU always allocated), or a VM.
- **Docker**: any Node 20 image works. Build stage: `npm ci && npm run build`. Run stage:
  `npm start` with `node_modules` + `.next` + `src/generated/prisma`. Run migrations as an
  init container or entrypoint step.
- **Sticky sessions**: not needed (see §7).
- **Backups**: enable automated PostgreSQL backups; attachments live in S3 (enable versioning
  or lifecycle rules) or local disk (include in volume backups).

## 9. Verification after deploy

1. Register a real account → verification email arrives → sign in.
2. Create a workspace → project → issue; drag the issue across the board in two browsers
   (second browser should update over Socket.IO).
3. Invite a second account and confirm role enforcement (Viewer cannot edit).
4. Confirm `GET /api/ai` reports `configured: false` unless you set AI keys — and that
   enabling them produces validated output.
5. Point a GitHub webhook at `/api/integrations/github/webhook` with a secret and confirm
   deliveries are accepted only with a valid signature (see docs/GITHUB_SETUP.md).

## Security notes

- Keep `AUTH_TRUST_HOST` set only behind a proxy you control; otherwise host-header
  spoofing can affect generated links.
- `ALLOWED_ORIGINS` restricts cross-origin API callers — set it to your deployment origins.
- Run the process as a non-root user; filesystem write access is only needed for
  `LOCAL_STORAGE_DIR` (if used) and `.next` cache.
- Apply database migrations from CI/CD, not from the app runtime, for clean rollbacks.
