import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { EmailConfigController } from './email-config.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';

@Global()
@Module({
  controllers: [EmailConfigController, NotificationPreferencesController],
  providers: [EmailService, NotificationPreferencesService],
  exports: [EmailService, NotificationPreferencesService],
})
export class NotificationsModule {}
