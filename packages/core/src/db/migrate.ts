import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDatabase } from './connection';
import { drizzle } from 'drizzle-orm/libsql';

async function runMigrations() {
  const { client } = getDatabase();
  const drizzleDb = drizzle(client);
  
  await migrate(drizzleDb, {
    migrationsFolder: './drizzle'
  });
  
  console.log('Migrations completed');
  process.exit(0);
}

runMigrations().catch(console.error);