import { DashboardModule } from './dashboard/dashboard.module.js';
import { AccountModule } from './account/account.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { AutomationModule } from './automation/automation.module.js';
import { WhatsappModule } from './whatsapp/whatsapp.module.js';
import { StatusModule } from './status/status.module.js';
import { PaymentSettingsModule } from './payment-settings/payment-settings.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { PushModule } from './push/push.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PortalModule } from './portal/portal.module.js';
import { LandingModule } from './landing/landing.module.js';
import { PlaceholderModule } from './placeholder/placeholder.module.js';
import { CronModule } from './cron/cron.module.js';
export const featureModules = [
  DashboardModule,
  AccountModule,
  TransactionsModule,
  MessagesModule,
  AutomationModule,
  WhatsappModule,
  StatusModule,
  PaymentSettingsModule,
  IntegrationsModule,
  PushModule,
  NotificationsModule,
  PortalModule,
  LandingModule,
  PlaceholderModule,
  CronModule,
];
