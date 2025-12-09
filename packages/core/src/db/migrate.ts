import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from './index';
import { ResultAsync } from 'neverthrow';

export function runMigrations() {
  return ResultAsync.fromPromise(
    (async () => {
      const db = getDb();
      await migrate(db, {
        migrationsFolder: './drizzle'
      });
      return 'Migrations completed';
    })(),
    (error: unknown) => new Error(`Migration failed: ${error}`)
  );
}