# coresvc

## Why

I need a personal "function space" - a place to quickly build and run utility functions without dealing with auth, logging, infrastructure boilerplate every time.

Example: Export my YouTube "Watch Later" playlist as JSON. Simple task, but requires OAuth, API calls, data transformation. Without coresvc, this means spinning up a new project, handling all the plumbing, then abandoning it.

coresvc centralizes this. One service holds my connected accounts, credentials (encrypted), and exposes utility endpoints I can hit manually or through interfaces like Telegram.

## What

**Monorepo with two packages:**

| Package | Purpose |
|---------|---------|
| `core` | Standalone Elysia server. Holds all logic, DB access, OAuth flows, connected services, utility endpoints. |
| `telegram` | Thin grammY bot. Calls core via Eden. Scaffolding for future features. |

**Core capabilities (v1):**
- Connected services management (OAuth + API keys, encrypted at rest)
- YouTube integration (OAuth flow, Watch Later export)
- Swagger UI for manual endpoint access

**Stack:**
- Bun (runtime + package manager + workspaces)
- Elysia + Eden (HTTP server + typed client)
- Drizzle + SQLite (DB)
- grammY (Telegram bot)
- AES-256-GCM (secrets encryption)

**Deployment:** Railway