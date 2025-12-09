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

- [ ] **5.1** Setup grammY bot in `src/interfaces/telegram/` with token from env
- [ ] **5.2** Add `/start` command with welcome message
- [ ] **5.3** Integrate bot startup into main `index.ts`
- [ ] **5.4** Setup graceful shutdown for bot

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
| `PORT` | core | Server port (default 3000) |
