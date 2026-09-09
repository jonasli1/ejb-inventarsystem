import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationTemplatesService } from './notification-templates.service';
import { EmailConfigController } from './email-config.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationTemplatesController } from './notification-templates.controller';

@Global()
@Module({
  controllers: [
    EmailConfigController,
    NotificationPreferencesController,
    NotificationTemplatesController,
  ],
  providers: [EmailService, NotificationPreferencesService, NotificationTemplatesService],
  exports: [EmailService, NotificationPreferencesService],
})
export class NotificationsModule {}
