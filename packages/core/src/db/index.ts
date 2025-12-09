import { createClient } from '@libsql/client';
import { mkdir } from 'fs/promises';
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!dbInstance) {
    const dbPath = process.env.DATABASE_PATH || './data/core.db';
    
    // Ensure data directory exists
    if (dbPath.includes('/')) {
      const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
      mkdir(dir, { recursive: true }).catch(() => {});
    }
    
    const client = createClient({
      url: `file:${dbPath}`,
    });
    
    dbInstance = drizzle(client, { schema });
  }
  
  return dbInstance;
}
