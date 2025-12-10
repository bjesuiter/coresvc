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

**Based on:** [ChatGPT's Memory Architecture](https://manthanguptaa.in/posts/chatgpt_memory/)

Multi-layered memory system for personalized, context-aware bot interactions:

### Layer 1: Session Context (Ephemeral)

- [ ] **C.1.1** Track current conversation state (active command, pending input)
- [ ] **C.1.2** Store temporary session data (command parameters, pagination state)
- [ ] **C.1.3** Auto-expire session data after inactivity timeout

### Layer 2: User Profile (Long-term)

- [ ] **C.2.1** Create `user_memory` table schema (id, category, fact, source, created_at, updated_at)
- [ ] **C.2.2** Generate migration for user memory table
- [ ] **C.2.3** Implement memory extraction from conversations (explicit "remember this" + auto-detection)
- [ ] **C.2.4** Implement `/remember <fact>` command for explicit memory storage
- [ ] **C.2.5** Implement `/forget <fact_id>` command for memory deletion
- [ ] **C.2.6** Implement `/memories` command to list stored facts
- [ ] **C.2.7** Categories: preferences, goals, projects, context, personal

### Layer 3: Conversation Summaries (Compressed History)

- [ ] **C.3.1** Create `conversation_summaries` table (id, summary, topics, message_count, period_start, period_end)
- [ ] **C.3.2** Implement periodic summarization job (daily/weekly)
- [ ] **C.3.3** Extract key topics and action items from conversations
- [ ] **C.3.4** Prune old raw messages after summarization
- [ ] **C.3.5** Implement `/history` command for recent activity overview

### Layer 4: Current Messages (Sliding Window)

- [ ] **C.4.1** Create `messages` table (id, role, content, timestamp, summarized)
- [ ] **C.4.2** Implement sliding window (last N messages or T minutes)
- [ ] **C.4.3** Include relevant context from upper layers in responses
- [ ] **C.4.4** Mark messages as summarized after compression

### Memory Integration

- [ ] **C.5.1** Create memory retrieval service (combines all layers for context)
- [ ] **C.5.2** Add memory context to bot response generation
- [ ] **C.5.3** Implement relevance scoring for memory retrieval
- [ ] **C.5.4** Add memory management REST endpoints (`GET/POST/DELETE /memory`)

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
