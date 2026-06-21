import { Elysia } from "elysia";
import { auth } from "../../auth";

export const authMiddleware = new Elysia({ name: "auth" })
  .derive(async ({ headers, set }) => {
    const authorization = headers.authorization;
    
    if (!authorization || !authorization.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("Unauthorized: No valid session token provided");
    }
    
    const token = authorization.slice(7); // Remove "Bearer " prefix
    
    try {
      const session = await auth.api.getSession({
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      
      if (!session) {
        set.status = 401;
        throw new Error("Unauthorized: Invalid or expired session token");
      }
      
      return {
        user: session.user,
        session: session.session
      };
    } catch (error) {
      set.status = 401;
      throw new Error("Unauthorized: Failed to validate session token");
    }
  });