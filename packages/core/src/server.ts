import { Elysia } from "elysia";
import { runMigrations } from "./db/migrate";
import { authRoutes } from "./interfaces/rest/auth";
import { auth } from "./auth";

async function startServer() {
  console.log("Core service starting...");

  // Run migrations on startup
  const migrationResult = await runMigrations();
  if (migrationResult.isErr()) {
    console.error(migrationResult.error.message);
    process.exit(1);
  }

  console.log(migrationResult.value);

  // Create Elysia server
  const app = new Elysia()
    .use(authRoutes)
    .get("/", () => ({ message: "Core service is running" }))
    .listen(process.env.PORT || 3000);

  console.log(`Core service started successfully on port ${app.server?.port}`);
}

startServer().catch(console.error);
