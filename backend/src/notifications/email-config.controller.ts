import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { EmailService } from './email.service';
import { UpdateEmailConfigDto } from './dto/update-email-config.dto';

class SendTestEmailDto {
  @IsEmail()
  toAddress: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
@Controller('notifications/email-config')
export class EmailConfigController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  getConfig() {
    return this.emailService.getConfig();
  }

  @Put()
  updateConfig(
    @Body() dto: UpdateEmailConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.emailService.updateConfig(dto, user.id);
  }

  @Post('test')
  async sendTest(@Body() dto: SendTestEmailDto) {
    await this.emailService.sendTestEmail(dto.toAddress);
    return { sent: true };
  }
}
