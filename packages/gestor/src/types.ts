import "express-session";

declare module "express-session" {
  interface SessionData {
    cliente?: { id: number; revision: string; viaLink?: boolean };
    user?: { id: number; name: string; username: string; email?: string | null; isAdmin?: boolean };
  }
}
