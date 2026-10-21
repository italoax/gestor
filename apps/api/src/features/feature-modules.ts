import { DashboardModule } from './dashboard/dashboard.module.ts';
import { AccountModule } from './account/account.module.ts';
import { TransactionsModule } from './transactions/transactions.module.ts';
import { MessagesModule } from './messages/messages.module.ts';
import { AutomationModule } from './automation/automation.module.ts';
import { WhatsappModule } from './whatsapp/whatsapp.module.ts';
import { StatusModule } from './status/status.module.ts';
import { PaymentSettingsModule } from './payment-settings/payment-settings.module.ts';
import { IntegrationsModule } from './integrations/integrations.module.ts';
import { PushModule } from './push/push.module.ts';
import { NotificationsModule } from './notifications/notifications.module.ts';
import { PortalModule } from './portal/portal.module.ts';
import { LandingModule } from './landing/landing.module.ts';
import { PlaceholderModule } from './placeholder/placeholder.module.ts';
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
];
