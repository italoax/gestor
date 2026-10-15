import { execute } from '../db/mysql.ts';
import { env } from '../config/env.ts';
import { createSecurityEvents } from './securityEvents.ts';
export const recordSecurityEvent = createSecurityEvents({
  execute,
  secret: env.sessionSecret,
});
