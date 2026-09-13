import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { GroupsModule } from './groups/groups.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ArticlesModule } from './articles/articles.module';
import { CategoriesModule } from './categories/categories.module';
import { LocationsModule } from './locations/locations.module';
import { InventoryModule } from './inventory/inventory.module';
import { LoansModule } from './loans/loans.module';
import { ActivityModule } from './activity/activity.module';
import { ExportModule } from './export/export.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { BackupModule } from './backup/backup.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { StickerProfilesModule } from './sticker-profiles/sticker-profiles.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: (config: Record<string, unknown>) => {
        const result: Joi.ValidationResult = envValidationSchema.validate(
          config,
          {
            abortEarly: false,
            allowUnknown: true,
          },
        );
        if (result.error)
          throw new Error(`Config validation error: ${result.error.message}`);
        return result.value as Record<string, unknown>;
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [],
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
            limit: parseInt(process.env.THROTTLE_LIMIT ?? '20', 10),
          },
        ],
        errorMessage:
          'Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.',
      }),
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    GroupsModule,
    OrganizationsModule,
    ArticlesModule,
    CategoriesModule,
    LocationsModule,
    InventoryModule,
    LoansModule,
    ActivityModule,
    ExportModule,
    AttachmentsModule,
    BackupModule,
    NotificationsModule,
    SettingsModule,
    StickerProfilesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
