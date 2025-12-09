import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const connectedServices = sqliteTable("connected_services", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  // Important: this provider must not be marked as unique,
  // as we want to allow multiple service connections with the same provider.
  // (for example with different accounts)
  provider: text("provider").notNull(),
  type: text("type", { enum: ["oauth", "apikey"] }).notNull(),
  encryptedData: text("encrypted_data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(
    () => new Date()
  ),
});

export type ConnectedService = typeof connectedServices.$inferSelect;
export type NewConnectedService = typeof connectedServices.$inferInsert;
