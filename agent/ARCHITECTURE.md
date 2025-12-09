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

## Phase 1: Monorepo Setup

- [ ] **1.1** Initialize Bun workspaces in root `package.json`
- [ ] **1.2** Create `packages/core` with Elysia, grammY, TypeScript config
- [ ] **1.3** Configure shared tsconfig base
- [ ] **1.4** Add root scripts for dev/build/test

## Phase 2: Core Database Layer

- [ ] **2.1** Add Drizzle + better-sqlite3 driver dependencies
- [ ] **2.2** Create DB connection module with file path config
- [ ] **2.3** Define `connected_services` table schema:
  - id, provider, type (oauth|apikey), encrypted_data, created_at, updated_at
- [ ] **2.4** Setup Drizzle migrations
- [ ] **2.5** Add migration scripts to package.json

## Phase 3: Encryption Module

- [ ] **3.1** Create AES-256-GCM encrypt function (takes plaintext + key → ciphertext + iv + tag)
- [ ] **3.2** Create decrypt function (takes ciphertext + iv + tag + key → plaintext)
- [ ] **3.3** Add helper for encrypting/decrypting JSON objects
- [ ] **3.4** Document ENCRYPTION_KEY env var requirements (32 bytes, base64)

## Phase 4: Connected Services

- [ ] **4.1** Create service layer for connected services CRUD
- [ ] **4.2** Implement `listServices()` - returns providers + connection status (no secrets)
- [ ] **4.3** Implement `getServiceCredentials(provider)` - decrypts and returns
- [ ] **4.4** Implement `saveServiceCredentials(provider, type, data)` - encrypts and stores
- [ ] **4.5** Implement `deleteService(provider)` - removes connection
- [ ] **4.6** Create Elysia routes:
  - `GET /services` - list all connected services
  - `DELETE /services/:provider` - disconnect a service

## Phase 5: OAuth Infrastructure (under /services)

- [ ] **5.1** Create OAuth state store (in-memory map: state → SSE controller)
- [ ] **5.2** Implement SSE stream endpoint `POST /services/:provider/connect`
- [ ] **5.3** Generate OAuth URL with state param, return in first SSE event
- [ ] **5.4** Implement callback route `GET /services/:provider/callback`
- [ ] **5.5** On callback: validate state, exchange code for tokens, encrypt & store, push SSE event, close stream
- [ ] **5.6** Add timeout cleanup for abandoned auth flows

## Phase 6: YouTube Integration

- [ ] **6.1** Add YouTube OAuth config (client ID, secret, scopes, redirect URI)
- [ ] **6.2** Implement YouTube OAuth provider (extends base OAuth flow)
- [ ] **6.3** Create YouTube API client with token refresh logic
- [ ] **6.4** Implement `getWatchLater()` - fetches playlist items, paginates, returns full list
- [ ] **6.5** Create route `GET /youtube/watch-later` - returns JSON export
- [ ] **6.6** Handle token expiry: auto-refresh, update stored tokens

## Phase 7: Swagger & Dev Experience

- [ ] **7.1** Add `@elysiajs/swagger` plugin
- [ ] **7.2** Configure OpenAPI metadata (title, version, description)
- [ ] **7.3** Add request/response schemas to all routes
- [ ] **7.4** Verify Swagger UI works at `/swagger`

## Phase 8: Telegram Interface

- [ ] **8.1** Setup grammY bot in `src/interfaces/telegram/` with token from env
- [ ] **8.2** Add `/start` command with welcome message
- [ ] **8.3** Integrate bot startup into main `index.ts`
- [ ] **8.4** Setup graceful shutdown for bot

## Phase 9: Deployment Prep

- [ ] **9.1** Create Dockerfile for core
- [ ] **9.2** Add Railway config (railway.toml or nixpacks)
- [ ] **9.3** Document required env vars
- [ ] **9.4** Add health check endpoints
- [ ] **9.5** Test local Docker setup

---

# Environment Variables

| Variable | Package | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | core | SQLite file path (default: ./data/core.db) |
| `ENCRYPTION_KEY` | core | 32-byte base64 encoded key |
| `YOUTUBE_CLIENT_ID` | core | Google OAuth client ID |
| `YOUTUBE_CLIENT_SECRET` | core | Google OAuth client secret |
| `TELEGRAM_BOT_TOKEN` | core | Bot token from BotFather |
| `PORT` | core | Server port (default 3000) |
