import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { NotificationTemplatesService } from './notification-templates.service';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
@Controller('notifications/templates')
export class NotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  findAll() {
    return this.templates.findAll();
  }

  @Get(':eventKey')
  findOne(@Param('eventKey') eventKey: string) {
    return this.templates.findOne(eventKey);
  }

  @Put(':eventKey')
  update(
    @Param('eventKey') eventKey: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    return this.templates.update(eventKey, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Put(':eventKey/reset')
  reset(@Param('eventKey') eventKey: string) {
    return this.templates.reset(eventKey);
  }
}
