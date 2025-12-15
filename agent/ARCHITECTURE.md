# Architecture

## Structure

```
packages/
  core/
    src/
      db/                     # Drizzle schema, migrations, connection
      crypto/                 # AES-256-GCM encrypt/decrypt helpers
      services/
        crud/                 # Connected services CRUD operations
        youtube/              # YouTube OAuth + API client
        github/               # GitHub OAuth + API client
      interfaces/
        rest/                 # Elysia route handlers (public REST API)
        telegram/             # grammY bot (inline, no Eden client needed)
      index.ts                # Server entry point (starts Elysia + bot)
```

## Data Flow

```
User → Telegram Bot → Core Server → SQLite
User → Swagger UI → Core Server → SQLite
User → curl/Postman → Core Server → SQLite
```

## OAuth Flow (SSE-based)

1. Interface calls `POST /services/{provider}/connect` → receives SSE stream + auth URL
2. Interface shows auth URL to user
3. User authenticates with provider
4. Provider redirects to Core callback (`/services/{provider}/callback`)
5. Core stores encrypted tokens, pushes success event to SSE stream
6. Interface receives event, notifies user

## Route Namespaces

- `/auth/*` - Reserved for core service authentication (future)
- `/services/*` - Connected services management + OAuth flows
- `/youtube/*` - YouTube-specific endpoints

---

# Implementation Phases

## Phase 1: Monorepo Setup ✅

- [x] **1.1** Initialize Bun workspaces in root `package.json`
- [x] **1.2** Create `packages/core` with Elysia, grammY, TypeScript config
- [x] **1.3** Configure shared tsconfig base
- [x] **1.4** Add root scripts for dev/build/test

## Phase 2: Core Database Layer ✅

- [x] **2.1** Add Drizzle + libsql driver dependencies
- [x] **2.2** Create DB connection module with file path config
- [x] **2.3** Define `connected_services` table schema:
  - id, provider, type (oauth|apikey), encrypted_data, created_at, updated_at
- [x] **2.4** Setup Drizzle migrations
- [x] **2.5** Add migration scripts to package.json

## Phase 3: Encryption Module ✅

- [x] **3.1** Create AES-256-GCM encrypt function (takes plaintext + key → ciphertext + iv + tag)
- [x] **3.2** Create decrypt function (takes ciphertext + iv + tag + key → plaintext)
- [x] **3.3** Add helper for encrypting/decrypting JSON objects
- [x] **3.4** Document ENCRYPTION_KEY env var requirements (32 bytes, base64)

## Phase 4: Authentication

**Stack:** better-auth + Drizzle + SQLite, database sessions

- [ ] **4.1** Add better-auth dependency
- [ ] **4.2** Create better-auth Drizzle schema (users, sessions, accounts tables)
- [ ] **4.3** Configure better-auth with email provider (no social login yet)
- [ ] **4.4** Implement `POST /auth/registerAdmin`:
  - Reads `ROOT_USER_EMAIL`, `ROOT_USER_LABEL`, `ROOT_USER_PASSWORD` from env
  - Creates user if not exists
  - `?force=true` overwrites existing user
  - Called on first startup
- [ ] **4.5** Implement `POST /auth/signin`:
  - Validates credentials via better-auth
  - Returns session cookie + structured body `{ sessionToken, expiresAt }`
  - `?tokenOnly=true` returns only the token string
- [ ] **4.6** Add auth middleware for protected routes
- [ ] **4.7** Document new env vars: `ROOT_USER_EMAIL`, `ROOT_USER_LABEL`, `ROOT_USER_PASSWORD`

**Future:** Social logins will link to existing accounts by email

## Phase 5: Telegram Interface

**Access:** Single owner only via `TELEGRAM_OWNER_ID` env var
**Auth:** Must link Telegram account to better-auth user before commands work

### Phase 5A: Core Bot Setup

- [ ] **5A.1** Setup grammY bot in `src/interfaces/telegram/` with token from env
- [ ] **5A.2** Add middleware to check `ctx.from.id` matches `TELEGRAM_OWNER_ID`
- [ ] **5A.3** Integrate bot startup into main `index.ts`
- [ ] **5A.4** Setup graceful shutdown for bot

### Phase 5B: Account Linking

- [ ] **5B.1** Create `telegram_links` table schema (telegram_user_id, user_id, linked_at)
- [ ] **5B.2** Generate migration for new table
- [ ] **5B.3** Create one-time link token generation (stores in DB with expiry)
- [ ] **5B.4** Implement `/auth/telegram/link?token=xxx` route that links accounts
- [ ] **5B.5** Add bot middleware to check if Telegram account is linked
- [ ] **5B.6** Implement `/start` with setup wizard:
  - If not linked → generate link token, send auth URL
  - If linked → show welcome + available commands

### Phase 5C: Status Command (First Priority)

- [ ] **5C.1** Implement `/status` command showing:
  - Server uptime
  - Database connection status
  - Bot connection status
  - Connected services count
- [ ] **5C.2** Add error handling for status checks

### Phase 5D: Services Command

- [ ] **5D.1** Implement `/services` command:
  - Lists all connected services with status
  - Shows connection date
  - No secrets exposed
- [ ] **5D.2** Handle empty state (no services connected)

### Phase 5E: Context-Aware Help

- [ ] **5E.1** Implement `/help` command that shows:
  - Different options based on link status
  - Different options based on connected services
  - Available commands for current state

### Phase 5F: OAuth via Telegram (Later)

- [ ] **5F.1** Implement `/connect <provider>` command
- [ ] **5F.2** Implement `/disconnect <provider>` command
- [ ] **5F.3** OAuth callback notification mechanism — **TBD: open for discussion**
  - Options: polling, deep link callback, manual confirmation, WebSocket/SSE

### Phase 5G: Inline Keyboards (Later)

- [ ] **5G.1** Add inline keyboard to `/start` for common actions
- [ ] **5G.2** Add inline keyboard to `/services` for quick actions
- [ ] **5G.3** Add confirmation keyboards for destructive actions

## Phase 6: Connected Services

- [ ] **6.1** Create service layer for connected services CRUD
- [ ] **6.2** Implement `listServices()` - returns providers + connection status (no secrets)
- [ ] **6.3** Implement `getServiceCredentials(provider)` - decrypts and returns
- [ ] **6.4** Implement `saveServiceCredentials(provider, type, data)` - encrypts and stores
- [ ] **6.5** Implement `deleteService(provider)` - removes connection
- [ ] **6.6** Create Elysia routes:
  - `GET /services` - list all connected services
  - `DELETE /services/:provider` - disconnect a service

## Phase 7: GitHub Integration

- [ ] **7.1** TODO: Plan GitHub integration

## Phase 8: YouTube Integration

- [ ] **8.1** Add YouTube OAuth config (client ID, secret, scopes, redirect URI)
- [ ] **8.2** Implement YouTube OAuth provider (extends base OAuth flow)
- [ ] **8.3** Create YouTube API client with token refresh logic
- [ ] **8.4** Implement `getWatchLater()` - fetches playlist items, paginates, returns full list
- [ ] **8.5** Create route `GET /youtube/watch-later` - returns JSON export
- [ ] **8.6** Handle token expiry: auto-refresh, update stored tokens

## Phase 9: Swagger & Dev Experience

- [ ] **9.1** Add `@elysiajs/swagger` plugin
- [ ] **9.2** Configure OpenAPI metadata (title, version, description)
- [ ] **9.3** Add request/response schemas to all routes
- [ ] **9.4** Verify Swagger UI works at `/swagger`

## Phase 10: Deployment Prep

- [ ] **10.1** Create Dockerfile for core
- [ ] **10.2** Add Railway config (railway.toml or nixpacks)
- [ ] **10.3** Document required env vars
- [ ] **10.4** Add health check endpoints
- [ ] **10.5** Test local Docker setup

---

# Addon Phases

## Addon A: Telegram Data Fetching

- [ ] **A.1** Implement `/watchlater` command (YouTube watch later export)
- [ ] **A.2** Add pagination/chunking for large responses
- [ ] **A.3** Add export format options (JSON, text summary)

## Addon B: Telegram Proactive Notifications

- [ ] **B.1** Design notification preferences storage
- [ ] **B.2** Implement background job scheduler (cron-style)
- [ ] **B.3** Add critical alerts (server down, token refresh failed)
- [ ] **B.4** Add optional regular updates (daily summaries, new items)
- [ ] **B.5** Implement `/notifications` command to configure preferences

## Addon C: Memory System

This section defines the **Memory System v1** architecture: a reliable, low-noise long-term context system built around **summaries + explicit memories**, with auditable provenance and deliberate secret-handling.

### Memory System v1 Spec (Agreed Decisions + Notes)

#### Goals (v1)

- Provide reliable, low-noise long-term context for the bot via **summaries + explicit memories**.
- Keep artifacts **auditable and regeneratable**, but avoid overbuilding (no auto action/todo extraction yet).
- Single-user/dev-focused; optimize for clarity and iteration.

---

#### Core Principles

##### “Summaries are views, not truth”

- Period summaries (weekly/monthly/…) are **regeneratable caches** derived from lower-level artifacts.
- “Truth” lives in:
  - explicit `user_memory` entries (created via `/remember`), and
  - original `messages` (as stored).

##### Regeneration & drift control

- Prefer generating each period summary **directly from conversation summaries within that period** when feasible:
  - weekly ← conversation-summaries in that week
  - monthly ← conversation-summaries in that month (not from weekly by default)
  - quarterly/yearly similarly (direct from conversation-summaries in that period when practical)
- Fallback to rollups is allowed later if needed for cost/size, but the preference is “direct from conversation-summaries” to reduce drift.

---

#### Data Model (v1)

##### 1) `messages` table (required in v1)

Purpose: persistent storage for chats/inputs and summarization source material.

Minimum fields:

- `id` (pk)
- `session_id` (string/uuid)
- `role` (`user|assistant|system` as needed)
- `content` (text)
  - Stored content is what the system will use; no encrypted raw storage in v1.
- `created_at` (timestamp)
- `summarized_at` (timestamp nullable) or `is_summarized` (boolean)
- Secret-scrub metadata:
  - `scrub_status` (`clean|flagged|approved|rejected`) or equivalent
  - `secrets_override` (boolean) — if approval was granted
  - optional: `scrub_reason` (text), `scrub_rule_hits` (json/text)

Retrieval rule (v1):

- Raw `messages` are **NOT** used for default context retrieval.
- Only the current live chat messages (runtime window) are used directly.

##### 2) `conversation_summaries` table (v1)

Purpose: “Layer 3” summaries; includes per-session summaries and calendar rollups.

Minimum fields:

- `id` (pk)
- `summary_type`:
  - `conversation-summary`
  - `weekly-summary`
  - `monthly-summary`
  - `quarterly-summary`
  - `yearly-summary`
- Period identifiers:
  - `period_key` (nullable for conversation-summary, required for calendar rollups)
  - `period_start` / `period_end` (nullable for conversation-summary, required for rollups)
- `content` (text) — **plain text only in v1** (no structured JSON storage)
- Versioning:
  - `prompt_version` (semver string, chosen as “highest semver”)
  - `pipeline_version` (semver string, chosen as “highest semver”)
- Job + provenance:
  - `job_run_id` (fk to `job_runs`)
  - `input_hash` (text) — stable hash of ordered source IDs/inputs
- Debug + audit:
  - `debug` (boolean)
  - `created_at`, `updated_at`

Uniqueness + storage behavior:

- “Current” summaries are **unique and upserted** by:
  - `(summary_type, period_key, prompt_version, pipeline_version, debug=false)`
- Debug summaries are **append-only** (no upsert), can have multiple attempts.

Selection (“current summary”) for retrieval:

- Always exclude `debug=true`
- Prefer highest `prompt_version` + highest `pipeline_version` (semver compare)
- For the selected tuple, there should be only one row (via upsert)

##### 3) `user_memory` table (v1)

Purpose: explicit long-term facts/preferences/goals captured via `/remember`.

Minimum fields:

- `id` (pk)
- `category` (string enum; your list from doc is fine)
- `content` (text)
- `status` (enum):
  - `active`
  - `deprecated` (used to be relevant, superseded)
  - `retracted` (was incorrect)
- `valid_from` (timestamp nullable)
- `valid_to` (timestamp nullable)
- `llmConfidence` (float 0..1 or numeric)
- `user_importance` (int 0–100), default **50**
- provenance fields (recommended):
  - `source_type` (`explicit_user` for v1)
  - `created_at`, `updated_at`

Decision:

- `pursuing_priority` is **removed for v1**; keep a doc note that it may return later for goals.

##### 4) `job_runs` table (v1)

Purpose: auditability + reproducible generation.

Minimum fields:

- `id` (pk)
- `job_type` (e.g. `summarize-conversation`, `summarize-week`, `truncate-summary`, etc.)
- `status` (`running|success|failed`)
- `input_hash` (text)
- `prompt_version` (semver)
- `pipeline_version` (semver)
- `started_at`, `finished_at`
- optional: `error` (text), `metrics` (json/text)

---

#### Summarization Rules (v1)

##### Conversation/session summaries

- Sessions are defined by:
  - **implicit inactivity timeout** (configurable), and
  - explicit `/newsession` command.
- Each message gets a `session_id`.
- A `conversation-summary` is generated for a session when the session is closed or timed out.

##### Period summaries

- Calendar-aligned rollups exist as artifacts (`weekly-summary`, etc.).
- Preferred inputs:
  - generate period summaries from **conversation-summaries in that exact period** (not from intermediate rollups) to reduce drift.

##### Hard caps + truncation

- Summary size target uses a dynamic cap:
  - `cap = min(8 KB, 10% of input chars)` (exact values configurable later)
- If the summarizer output exceeds cap:
  - store an oversized output as `debug=true` entry
  - run a dedicated **truncation LLM step** to cut irrelevant info
  - store the final non-debug “current” summary via upsert

##### Idempotency / when to recompute

- Automatic/scheduled jobs:
  - do **not** recompute if `input_hash` unchanged (skip LLM calls)
  - recompute only when `input_hash` changed
- Prompt/pipeline version bumps:
  - do **not** recompute automatically when only version changed
  - recompute **only when manually forced**
- Manual jobs accept `force=true`:
  - regenerate even if `input_hash` unchanged

---

#### Secret Scrubbing & Approvals (v1)

##### Scrub pipeline

- **Regex/best-effort scrubber** runs on each incoming message.
- If scrubber flags suspicious content:
  - run **LLM scrub** (only when regex flags something)
  - produce a redacted preview
  - require explicit approval before storing/summarizing (unless denied)

##### REST behavior (no Telegram dependency)

- If input is flagged during REST request:
  - request fails with a conflict (e.g. 409)
  - response returns:
    - the redacted message
    - HATEOAS-style links to approve/reject

##### `pending_scrub_approvals` table (v1)

- Stores pending approvals with expiry.
- Minimum fields:
  - `id`
  - `full_text` (as received)
  - `redacted_text`
  - `reason` / metadata
  - `expires_at`
  - `created_at`
  - audit on resolution:
    - `approved_at`
    - `approved_via` (`rest|telegram` possible later)
    - `approved_by_user_id` (if applicable)
    - `rejected_at`
- Rejected approvals are kept temporarily (e.g. 7 days) for debugging (policy can be implemented later).

##### Override semantics

- If user approves, it’s a master override:
  - store the full message in plaintext
  - include it in summarization like normal
- Note: this intentionally accepts the risk of secrets entering DB/summaries; user is cautious and override is deliberate.

---

#### Retrieval Policy (v1)

Default context assembly (for LLM responses):

- Use:
  - session context (runtime)
  - relevant `conversation_summaries` (recent + current period windows as defined elsewhere)
  - optionally `user_memory` (active + top-N by `user_importance`)
- Do **not** include stored raw `messages` by default.

Active retrieval (later):

- Consider **FTS5 first** for searching `user_memory` + `conversation_summaries`
- Keep hook to later add embeddings via `sqlite-vec`.

---

#### Commands / UX (v1)

##### `/remember <text...>`

- User provides free-form text.
- System uses LLM to propose structured fields (category, status, validity, llmConfidence, importance).
- Always show proposed memory back to user for confirmation before insert.

(No auto-extraction from conversations in v1.)

---

#### Cleanup / Maintenance (Developer-only, v1)

Destructive cleanup actions (like “delete browser data”):

- delete all `conversation_summaries` where `debug=true`
- delete legacy `pipeline_version` summaries (keeping latest per `(summary_type, period_key)`)
- delete legacy `prompt_version` summaries (keeping latest per `(summary_type, period_key)`)

---

#### Notes / Deferred Ideas

- Add “secret chats” concept later (different storage/summarization rules).
- Consider message retention later:
  - export/archive older `messages` (e.g. per thread/session) and then purge.
- Consider reintroducing `pursuing_priority` later if goals need a separate “activity” axis from `user_importance`.
- Consider tags/entities later (additional columns or structured storage) as a new pipeline version.

---

# Environment Variables

| Variable | Package | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | core | SQLite file path (default: ./data/core.db) |
| `ENCRYPTION_KEY` | core | 32-byte base64 encoded key |
| `ROOT_USER_EMAIL` | core | Admin user email for initial setup |
| `ROOT_USER_LABEL` | core | Admin user display name |
| `ROOT_USER_PASSWORD` | core | Admin user password |
| `YOUTUBE_CLIENT_ID` | core | Google OAuth client ID |
| `YOUTUBE_CLIENT_SECRET` | core | Google OAuth client secret |
| `TELEGRAM_BOT_TOKEN` | core | Bot token from BotFather |
| `TELEGRAM_OWNER_ID` | core | Telegram user ID allowed to use the bot |
| `PORT` | core | Server port (default 3000) |
