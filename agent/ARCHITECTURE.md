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

## Revised Implementation Phases

### Phase 4: Basic Message Logging (New)
*Goal: Start accumulating raw data immediately for future summarization.*

- [ ] **4.1** Create `messages` table schema:
  - id, session_id, role, content (text), created_at, is_summarized (boolean)
  - metadata/scrubbing fields: `scrub_status`, `secrets_override`
- [ ] **4.2** Implement **Sliding Session Logic**:
  - Timeout > 8 hours = New Session ID (effectively "Daily" sessions).
  - Else = Append to current Session ID.
- [ ] **4.3** Add basic `insertMessage` helper in core services.

### Phase 5: Authentication & Telegram Bot (Merged/Refined)
*Goal: User identity and interface.*

- [ ] **5.1** Setup `better-auth` + Drizzle (User/Session/Account tables).
- [ ] **5.2** Implement `POST /auth/registerAdmin` (Env var driven).
- [ ] **5.3** Setup grammY bot (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`).
- [ ] **5.4** Implement Telegram Auth Middleware (Link Telegram ID to better-auth User).
- [ ] **5.5** Implement `/start` and `/status` commands.

### Phase 6: Memory System v1 (The "Brain")
*Goal: Long-term context without hallucinations.*

**Dependencies:** `croner` (for job scheduling).

#### 6A. Schema & Data Model
- [ ] **6A.1** Create `user_memory` table (Facts):
  - id, category, content, status (active/deprecated), valid_from/to, user_importance (0-100).
  - *Note: `pursuing_priority` removed for v1.*
- [ ] **6A.2** Create `conversation_summaries` table (Context):
  - id, summary_type (`conversation`, `weekly`, `monthly`, `quarterly`, `yearly`).
  - period_key (e.g., `2025-W01`), period_start, period_end.
  - content (text), prompt_version, pipeline_version.
  - input_hash (for idempotency).
- [ ] **6A.3** Create `job_runs` table (Audit):
  - id, job_type, status, input_hash, started_at, finished_at.

#### 6B. Ingestion & Scrubbing
- [ ] **6B.1** Implement Regex Secret Scrubber.
- [ ] **6B.2** Implement Telegram-native Scrub Flow:
  - If secret detected -> Block message -> Reply "Secret detected. Reply `/approve` to save."
  - If approved -> Save with `secrets_override = true`.

#### 6C. Summarization Pipeline
- [ ] **6C.1** Setup `croner` for background jobs (avoid heavy queues).
- [ ] **6C.2** Implement **Session Summarizer**:
  - Triggers on session close (>8h inactivity) or `/newsession`.
  - Cap strategy: `min(8KB, max(500 chars, 10% of input))`.
- [ ] **6C.3** Implement **Period Rollups**:
  - Weekly: Summarize *Conversation Summaries* from Mon-Sun.
  - Monthly: Summarize *Conversation Summaries* from that month.
  - *Note: No `daily-summary` (covered by 8h sessions).*
- [ ] **6C.4** Implement Idempotency:
  - Calculate `input_hash`. If unchanged, skip LLM call.

#### 6D. Retrieval & Interaction
- [ ] **6D.1** Implement `/remember <text>` command (Explicit memory).
- [ ] **6D.2** Implement Context Assembler for Bot:
  - Fetch: Current Session + Recent Conversation Summaries + Active User Memory.
  - *Exclude:* Raw historic messages (noise).

### Phase 7: Connected Services (Was Phase 6)
- [ ] **7.1** Service Registry (CRUD for API keys).
- [ ] **7.2** Encryption for stored credentials.

### Phase 8: YouTube & GitHub (Was Phase 7/8)
- [ ] **8.1** YouTube OAuth & Watch Later sync.
- [ ] **8.2** GitHub Integration plan.

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
