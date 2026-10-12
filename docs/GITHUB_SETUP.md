# GitHub integration setup

TaskFlow can connect GitHub repositories to projects: link branches, commits, and pull
requests to issues by issue key (`NOVA-104`), verified with HMAC-signed webhooks, with
tokens encrypted at rest.

**Without credentials the integration reports an explicit "not configured" state and
never pretends to be connected.** Nothing here is simulated.

## What you need

| Credential | Purpose | Required for |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app | User-facing "Connect GitHub" flow |
| `GITHUB_WEBHOOK_SECRET` | Verifies `X-Hub-Signature-256` | Receiving webhooks (branch/PR/commit events) |
| `INTEGRATION_ENCRYPTION_KEY` | AES-256-GCM key (`openssl rand -hex 32`) | Storing installation tokens |

All three are server-side environment variables only (never exposed to the browser).

## 1. Create a GitHub OAuth app

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
2. Homepage URL: `https://your-taskflow-domain`.
3. Authorization callback URL: `https://your-taskflow-domain/api/auth/callback/github` —
   or, for the workspace-scoped connect flow, the URL shown in
   **Settings → Integrations** (it includes the workspace slug).
4. Copy the client ID and secret into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

## 2. Set the token encryption key

```bash
openssl rand -hex 32   # → INTEGRATION_ENCRYPTION_KEY
```

Tokens returned by GitHub are encrypted with AES-256-GCM before storage
(`Integration.encryptedSecret`). Rotating this key invalidates stored tokens; users must
reconnect. There is no way to recover a token if this key is lost — by design.

## 3. Create a webhook

1. On the repository (or organization) → Settings → **Webhooks** → Add webhook.
2. Payload URL: `https://your-taskflow-domain/api/integrations/github/webhook`.
3. Content type: `application/json`.
4. Secret: `openssl rand -hex 20` → `GITHUB_WEBHOOK_SECRET` (same value in both places).
5. Events: **Let me select individual events** → `pushes`, `pull requests`,
   `commit comments` (branches/commits/PRs are the linked object types).

TaskFlow verifies every delivery:

- `X-Hub-Signature-256` must match HMAC-SHA256 of the **raw request body** with the
  webhook secret (constant-time comparison). Invalid signatures are rejected (401).
- Deliveries are deduplicated by GitHub's delivery GUID (`X-GitHub-Delivery`).

## 4. Connect a repository

1. Workspace → **Integrations** → **Connect GitHub** (or Settings → Integrations).
2. Authorize the OAuth app (or paste a fine-grained PAT with `contents:read`,
   `pull_requests:read` if you use the manual-token flow).
3. Select the repositories the workspace may see. The allowlist is stored in the
   integration config; events from other repos are ignored.

## Issue-key association

TaskFlow extracts issue keys from branch names, commit messages, and PR titles with
`\b([A-Z][A-Z0-9]{1,7}-\d{1,7})\b` (e.g. `feature/NOVA-104-fix`, `NOVA-104 fix login`).
Matches create `IssueReference` records (BRANCH / COMMIT / PULL_REQUEST) that appear on
the issue page.

**References never change issue state.** A merged PR does not mark an issue done —
presence of a reference is informational, and notification copy says so explicitly.

Untrusted webhook text is treated as data everywhere it is rendered (it is never
interpreted as instructions, including by the AI assistant).

## Webhook API

`POST /api/integrations/github/webhook`

- Headers: `X-GitHub-Event`, `X-GitHub-Delivery`, `X-Hub-Signature-256`
- Body: raw GitHub JSON payload
- Responses: `202` accepted · `401` bad signature · `400` malformed · `200` ignored event

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "GitHub integration is not fully configured" | Set `GITHUB_CLIENT_ID/SECRET`, `GITHUB_WEBHOOK_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, restart |
| "Token storage is not configured" | `INTEGRATION_ENCRYPTION_KEY` missing |
| "Webhooks are not configured" | `GITHUB_WEBHOOK_SECRET` missing |
| Deliveries show `401` | Secret mismatch — copy the exact value into both GitHub and `.env` |
| Nothing appears on issues | Key regex requires uppercase project keys (`NOVA-104`), and the repo must be in the workspace allowlist |

## Security notes

- Webhook payloads are stored for audit (`WebhookEvent`, deduplicated per delivery) and
  are never used to mutate issues directly.
- Never log tokens or webhook secrets; the app logs only metadata (event type, delivery ID).
- Scope OAuth to the minimum (`repo` read-only if using classic OAuth; fine-grained
  `contents:read` + `pull_requests:read` is enough for references).
