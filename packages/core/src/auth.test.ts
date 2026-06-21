import { describe, test, expect } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "./db/schema.js";
import { resetDbInstance, setDbInstance } from "./db/index.js";

/**
 * Creates a fresh in-memory database with all required tables using migrations.
 */
async function createTestDb() {
  const client = createClient({
    url: ":memory:",
  });

  const db = drizzle(client, { schema });

  // Run migrations to create tables
  await migrate(db, {
    migrationsFolder: "./drizzle",
  });

  return db;
}

/**
 * Creates a fresh auth instance with the given database.
 */
function createTestAuth(db: ReturnType<typeof drizzle>) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      storeSessionInDatabase: true,
    },
  });
}

describe("Auth System", () => {
  const testUser = {
    email: "test@example.com",
    password: "password123",
    name: "Test User",
  };

  describe("User Registration", () => {
    test("should create a new user successfully", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      const result = await auth.api.signUpEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        },
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testUser.email);
      expect(result.user.name).toBe(testUser.name);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");

      resetDbInstance();
    });

    test("should reject duplicate email registration", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      // First, create the user
      await auth.api.signUpEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        },
      });

      // Now try to register again with same email
      try {
        await auth.api.signUpEmail({
          body: {
            email: testUser.email,
            password: "differentpassword",
            name: "Different Name",
          },
        });

        // If we reach here, the test should fail
        expect.unreachable("Should have thrown an error for duplicate email");
      } catch (error: unknown) {
        expect(error).toBeDefined();
        if (error && typeof error === "object" && "body" in error) {
          const apiError = error as { body?: { code?: string } };
          expect(apiError.body?.code).toBe(
            "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          );
        }
      }

      resetDbInstance();
    });

    test("should reject registration with invalid email format", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      try {
        await auth.api.signUpEmail({
          body: {
            email: "invalid-email",
            password: testUser.password,
            name: testUser.name,
          },
        });

        expect.unreachable("Should have thrown an error for invalid email");
      } catch (error: unknown) {
        expect(error).toBeDefined();
      }

      resetDbInstance();
    });
  });

  describe("User Authentication", () => {
    test("should sign in with valid credentials", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      // Create user first
      await auth.api.signUpEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        },
      });

      const result = await auth.api.signInEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testUser.email);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");

      resetDbInstance();
    });

    test("should reject invalid password", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      // Create user first
      await auth.api.signUpEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        },
      });

      try {
        await auth.api.signInEmail({
          body: {
            email: testUser.email,
            password: "wrongpassword",
          },
        });

        expect.unreachable("Should have thrown an error for invalid password");
      } catch (error: unknown) {
        expect(error).toBeDefined();
        if (error && typeof error === "object" && "body" in error) {
          const apiError = error as { body?: { code?: string } };
          // better-auth uses generic error for security (prevents user enumeration)
          expect(apiError.body?.code).toBe("INVALID_EMAIL_OR_PASSWORD");
        }
      }

      resetDbInstance();
    });

    test("should reject non-existent user", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      try {
        await auth.api.signInEmail({
          body: {
            email: "nonexistent@example.com",
            password: "password123",
          },
        });

        expect.unreachable("Should have thrown an error for non-existent user");
      } catch (error: unknown) {
        expect(error).toBeDefined();
        if (error && typeof error === "object" && "body" in error) {
          const apiError = error as { body?: { code?: string } };
          // better-auth uses generic error for security (prevents user enumeration)
          expect(apiError.body?.code).toBe("INVALID_EMAIL_OR_PASSWORD");
        }
      }

      resetDbInstance();
    });
  });

  describe("Session Management", () => {
    test("should return session cookie on sign in", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      // Create user first
      await auth.api.signUpEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        },
      });

      const signInResult = await auth.api.signInEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
        },
        returnHeaders: true,
      });

      expect(signInResult).toBeDefined();
      expect(signInResult.response).toBeDefined();
      expect(signInResult.response.user).toBeDefined();
      expect(signInResult.response.token).toBeDefined();

      // Check that session cookie is set
      const setCookieHeader = signInResult.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain("better-auth.session_token");

      resetDbInstance();
    });

    test("should validate session with cookie from sign-in", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      // Create user first
      await auth.api.signUpEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        },
      });

      // Sign in and get the session cookie
      const signInResult = await auth.api.signInEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
        },
        returnHeaders: true,
      });

      const setCookieHeader = signInResult.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();

      // Use the cookie to get session
      const sessionResult = await auth.api.getSession({
        headers: {
          cookie: setCookieHeader!,
        },
      });

      expect(sessionResult).not.toBeNull();
      expect(sessionResult?.user).toBeDefined();
      expect(sessionResult?.user.email).toBe(testUser.email);
      expect(sessionResult?.session).toBeDefined();

      resetDbInstance();
    });

    test("should return null for invalid session token", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      const sessionResult = await auth.api.getSession({
        headers: {
          cookie: "better-auth.session_token=invalid_token_123",
        },
      });

      // getSession returns null for invalid tokens, doesn't throw
      expect(sessionResult).toBeNull();

      resetDbInstance();
    });

    test("should return null for missing session token", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      const sessionResult = await auth.api.getSession({
        headers: {},
      });

      // getSession returns null when no token is provided
      expect(sessionResult).toBeNull();

      resetDbInstance();
    });

    test("should return null for expired session format", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      const sessionResult = await auth.api.getSession({
        headers: {
          cookie: "better-auth.session_token=",
        },
      });

      expect(sessionResult).toBeNull();

      resetDbInstance();
    });
  });

  describe("Multiple Users", () => {
    test("should handle multiple user registrations independently", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      const user1 = {
        email: "user1@example.com",
        password: "password1",
        name: "User One",
      };
      const user2 = {
        email: "user2@example.com",
        password: "password2",
        name: "User Two",
      };

      // Register both users
      const result1 = await auth.api.signUpEmail({
        body: user1,
      });
      const result2 = await auth.api.signUpEmail({
        body: user2,
      });

      expect(result1.user.email).toBe(user1.email);
      expect(result2.user.email).toBe(user2.email);
      expect(result1.user.id).not.toBe(result2.user.id);

      resetDbInstance();
    });

    test("should maintain separate sessions for different users", async () => {
      const testDb = await createTestDb();
      setDbInstance(testDb);
      const auth = createTestAuth(testDb);

      const user1 = {
        email: "user1@example.com",
        password: "password1",
        name: "User One",
      };
      const user2 = {
        email: "user2@example.com",
        password: "password2",
        name: "User Two",
      };

      // Register both users
      await auth.api.signUpEmail({ body: user1 });
      await auth.api.signUpEmail({ body: user2 });

      // Sign in both users
      const signIn1 = await auth.api.signInEmail({
        body: { email: user1.email, password: user1.password },
        returnHeaders: true,
      });
      const signIn2 = await auth.api.signInEmail({
        body: { email: user2.email, password: user2.password },
        returnHeaders: true,
      });

      // Verify sessions are different
      expect(signIn1.response.token).not.toBe(signIn2.response.token);

      // Verify each session returns correct user
      const session1 = await auth.api.getSession({
        headers: { cookie: signIn1.headers.get("set-cookie")! },
      });
      const session2 = await auth.api.getSession({
        headers: { cookie: signIn2.headers.get("set-cookie")! },
      });

      expect(session1?.user.email).toBe(user1.email);
      expect(session2?.user.email).toBe(user2.email);

      resetDbInstance();
    });
  });
});