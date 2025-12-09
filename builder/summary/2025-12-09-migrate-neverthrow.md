# Migration to neverthrow for Database Migrations

**Date:** 2025-12-09

## Changes

### 1. Added neverthrow dependency
- Installed `neverthrow@8.2.0` to `@coresvc/core`

### 2. Updated `packages/core/src/db/migrate.ts`
- Exported `runMigrations()` function returning `ResultAsync<string, Error>`
- Wrapped migration logic in `ResultAsync.fromPromise()`
- Added proper TypeScript typing for error handlers
- Maintained CLI execution with `import.meta.main` check
- Uses `.match()` for result handling

### 3. Updated `packages/core/src/server.ts`
- Removed direct drizzle migration import
- Now imports and uses `runMigrations()` from migrate module
- Uses `.isErr()` to check migration result
- Accesses success message via `.value` property
- Cleaner error handling without try-catch

## Benefits
- Type-safe error handling
- Explicit success/failure states
- Better composability
- Consistent error handling pattern across codebase
