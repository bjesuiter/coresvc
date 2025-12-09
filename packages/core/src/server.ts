import { runMigrations } from "./db/migrate";

async function startServer() {
  console.log("Core service starting...");

  // Run migrations on startup
  const migrationResult = await runMigrations();
  if (migrationResult.isErr()) {
    console.error(migrationResult.error.message);
    process.exit(1);
  }

  console.log(migrationResult.value);
  console.log("Core service started successfully");
}

startServer().catch(console.error);
