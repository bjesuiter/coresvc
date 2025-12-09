import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from './index';

async function runMigrations() {
  const db = getDb();
  
  await migrate(db, {
    migrationsFolder: './drizzle'
  });
  
  console.log('Migrations completed');
  process.exit(0);
}

runMigrations().catch(console.error);