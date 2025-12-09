import { createClient } from '@libsql/client';
import { mkdir } from 'fs/promises';

export interface DatabaseConnection {
  client: ReturnType<typeof createClient>;
}

let dbInstance: DatabaseConnection | null = null;

export function getDatabase(): DatabaseConnection {
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
    
    dbInstance = { client };
  }
  
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    // libsql client doesn't have explicit close method
    dbInstance = null;
  }
}