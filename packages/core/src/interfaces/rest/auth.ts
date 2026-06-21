import { Elysia } from "elysia";
import { APIError } from "better-auth/api";
import { auth } from "../../../src/auth";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post("/registerAdmin", async ({ body, set }) => {
    try {
      const { force } = body as { force?: boolean };
      
      // Get environment variables
      const email = process.env.ROOT_USER_EMAIL;
      const label = process.env.ROOT_USER_LABEL;
      const password = process.env.ROOT_USER_PASSWORD;
      
      if (!email || !label || !password) {
        set.status = 500;
        return {
          success: false,
          error: "Missing required environment variables: ROOT_USER_EMAIL, ROOT_USER_LABEL, ROOT_USER_PASSWORD"
        };
      }
      
      // For now, we'll just try to create the user. If it already exists, better-auth will return an error.
      // In a real implementation, you might want to check if the user exists first using a database query.
      
      // Create new admin user
      const result = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: label,
        }
      });
      
      return {
        success: true,
        message: "Admin user registered successfully",
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        }
      };
      
    } catch (error) {
      console.error("Admin registration error:", error);
      
      if (error instanceof APIError) {
        set.status = error.status as any;
        return {
          success: false,
          error: error.message
        };
      }
      
      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      };
    }
  })
  .post("/signin", async ({ body, set }) => {
    try {
      const { email, password, tokenOnly } = body as { 
        email: string; 
        password: string; 
        tokenOnly?: boolean;
      };
      
      if (!email || !password) {
        set.status = 400;
        return {
          success: false,
          error: "Email and password are required"
        };
      }
      
      // Sign in with better-auth
      const result = await auth.api.signInEmail({
        body: { email, password },
        returnHeaders: true,
      });
      
      if (tokenOnly) {
        return {
          success: true,
          sessionToken: result.response.token,
        };
      }
      
      return {
        success: true,
        sessionToken: result.response.token,
        user: {
          id: result.response.user.id,
          email: result.response.user.email,
          name: result.response.user.name,
        }
      };
      
    } catch (error) {
      console.error("Sign in error:", error);
      
      if (error instanceof APIError) {
        set.status = error.status as any;
        return {
          success: false,
          error: error.message
        };
      }
      
      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      };
    }
  });