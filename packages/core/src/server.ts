import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from './db';

async function startServer() {
  console.log("Core service starting...");
  
  // Run migrations on startup
  try {
    const db = getDb();
    await migrate(db, {
      migrationsFolder: './drizzle'
    });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  
  console.log("Core service started successfully");
}

startServer().catch(console.error);