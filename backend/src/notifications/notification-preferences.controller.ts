import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { NotificationPreferencesService } from './notification-preferences.service';
import { SetNotificationPreferenceDto } from './dto/set-notification-preference.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.preferences.listForUser(user.id);
  }

  @Put(':eventKey')
  async set(
    @Param('eventKey') eventKey: string,
    @Body() dto: SetNotificationPreferenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.preferences.setPreference(user.id, eventKey, dto.enabled);
    return this.preferences.listForUser(user.id);
  }
}
