import { getDatabase } from "./connection";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function getDb() {
  const { client } = getDatabase();
  const db = drizzle(client, { schema });
  return db;
}
