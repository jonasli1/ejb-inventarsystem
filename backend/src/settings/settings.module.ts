import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppSettingsService } from './app-settings.service';
import { SettingsController } from './settings.controller';

// Global so AuthService can inject AppSettingsService directly (for
// login-method enforcement) without AuthModule importing this module back -
// same pattern as EmailService/NotificationsModule already used for
// password-reset gating.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class SettingsModule {}
