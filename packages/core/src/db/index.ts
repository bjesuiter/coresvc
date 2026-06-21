import { createClient, type Client } from '@libsql/client';
import { mkdir } from 'fs/promises';
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let dbInstance: LibSQLDatabase<typeof schema> | null = null;
let dbClient: Client | null = null;

export function getDb(): LibSQLDatabase<typeof schema> {
  if (!dbInstance) {
    const dbPath = process.env.DATABASE_PATH || './data/core.db';
    
    // Ensure data directory exists
    if (dbPath.includes('/')) {
      const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
      mkdir(dir, { recursive: true }).catch(() => {});
    }
    
    dbClient = createClient({
      url: `file:${dbPath}`,
    });
    
    dbInstance = drizzle(dbClient, { schema });
  }
  
  return dbInstance;
}

/**
 * Reset the database instance. Used for testing to inject a mock database.
 */
export function resetDbInstance(): void {
  dbInstance = null;
  dbClient = null;
}

/**
 * Set a custom database instance. Used for testing with in-memory databases.
 */
export function setDbInstance(instance: LibSQLDatabase<typeof schema>): void {
  dbInstance = instance;
}
