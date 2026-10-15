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

`AUTH_SECRET` is **not optional**: without it Auth.js rejects every request to
`/api/auth/*` with `500 {"message":"There was a problem with the server configuration…"}`
and bounces the browser to `/login?error=Configuration` — sign-in, registration
and session restore all fail. Generate one with `openssl rand -base64 32` and set
it for **every** environment you deploy (on Vercel: Project → Settings →
Environment Variables → add for Production *and* Preview, then redeploy — env
changes do not apply to already-built deployments).

`AUTH_TRUST_HOST=1` is required in production behind any proxy you run yourself
(nginx, Caddy, ALB). Vercel and Cloudflare Pages are auto-detected by Auth.js, so
it is optional there — but harmless to set.

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

- **Vercel/Netlify/serverless**: the Next.js app itself deploys and runs fine —
  pages, API routes, Auth.js and Prisma all work. What does **not** run is
  `server.ts`, because those platforms ignore custom servers: no Socket.IO
  endpoint (realtime board updates degrade to `router.refresh()` on the client's
  next navigation) and no background job scheduler (due-date reminder emails stop).
  Acceptable for a demo/preview; for production use Railway, Render, Fly.io,
  ECS/Fargate, Cloud Run (with min-instances ≥ 1 and CPU always allocated), or a VM
  so `npm start` runs the full server. If you must stay serverless, host the
  realtime layer separately (see §7) and run jobs on a cron/queue worker.
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

## 10. Troubleshooting

### `GET /api/auth/session` → 500, browser shows `/login?error=Configuration`

Symptom (from a real Vercel production request): the function invocation for
`/api/auth/[...nextauth]` finishes in a few milliseconds, makes **no outgoing
requests**, and responds `500 {"message":"There was a problem with the server
configuration. Check the server logs for more information."}`. Auth.js redirects
the browser to `pages.error` (`/login`) with `?error=Configuration`.

Cause: Auth.js could not build a valid config for the request. It is almost always
one of these, in order of likelihood:

| Cause | Fix |
| --- | --- |
| `AUTH_SECRET` missing/empty **for that environment** (e.g. set for Preview only, or added after the last build) | Vercel → Project → Settings → Environment Variables → add `AUTH_SECRET` (`openssl rand -base64 32`) for Production *and* Preview → **Redeploy** |
| `AUTH_TRUST_HOST` missing in production behind a self-managed proxy (Vercel/CF Pages are auto-trusted) | Set `AUTH_TRUST_HOST=1` and redeploy |
| `DATABASE_URL` missing — `src/lib/prisma.ts` throws at import, before Auth.js runs | Set `DATABASE_URL` (and run migrations, §4) and redeploy |

Diagnosis: the app logs the reason itself. Look for these entries in the function
logs (they name variables, never values):

```json
{"level":"error","message":"env.missing_required_variables","context":"auth","missing":["AUTH_SECRET"],"serverless":true,"hint":"…"}
{"level":"error","message":"auth.route.configuration_error","path":"/api/auth/session","status":500,"missing":["AUTH_SECRET"]}
```

If `missing` is empty, the Auth.js error line printed just above
(`MissingSecret`, `UntrustedHost`, …) identifies the problem — see
https://errors.authjs.dev.

Verify the fix without a browser: `GET /api/auth/session` should return
`200` with body `null` when signed out (a JSON object with `user` when signed in),
and `GET /api/auth/providers` should return `200`. Any 500 on those two routes
still means configuration, not application code.

### Other common post-deploy failures

| Symptom | Cause / fix |
| --- | --- |
| Board does not live-update, `/socket.io/*` returns 404 | Serverless host: `server.ts` never runs (§8). Use a long-lived Node host or a separate realtime service |
| No reminder emails | Same reason (scheduler lives in `server.ts`), or `RESEND_API_KEY` unset — emails then only log to stdout |
| `prisma generate` fails during `npm ci` in CI | Needs no database, but Prisma 7 loads `prisma.config.ts`; the config now falls back to a placeholder URL, so generation works without `DATABASE_URL` |
| Google sign-in button missing | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` not set for that environment (email/password still works) |

## Security notes

- Keep `AUTH_TRUST_HOST` set only behind a proxy you control; otherwise host-header
  spoofing can affect generated links.
- `ALLOWED_ORIGINS` restricts cross-origin API callers — set it to your deployment origins.
- Run the process as a non-root user; filesystem write access is only needed for
  `LOCAL_STORAGE_DIR` (if used) and `.next` cache.
- Apply database migrations from CI/CD, not from the app runtime, for clean rollbacks.
