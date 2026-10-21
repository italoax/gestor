import 'express-session';
import type { PanelUser } from '../../apps/api/src/auth/auth.types.ts';

declare module 'express-session' {
  interface SessionData {
    user?: PanelUser;
    cliente?: { id: number; revision: string; viaLink?: boolean };
    csrfToken?: string;
    cacheRevision?: number;
    security?: import('../services/sessionSecurity.ts').SessionSecurity;
  }
}
