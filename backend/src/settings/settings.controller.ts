import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { ChurchToolsService } from '../auth/churchtools/churchtools.service';
import { AppSettingsService } from './app-settings.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

@ApiTags('settings')
@Controller('settings/general')
export class SettingsController {
  constructor(
    private readonly settings: AppSettingsService,
    private readonly churchTools: ChurchToolsService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Public: app name/logo/login-method availability, needed before login',
  })
  async getPublicConfig() {
    const config = await this.settings.getConfig();
    return {
      ...config,
      churchToolsAvailable:
        config.churchToolsEnabled && this.churchTools.isConfigured(),
      passkeyAvailable: config.passkeyEnabled,
    };
  }

  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Put()
  updateConfig(
    @Body() dto: UpdateAppSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settings.updateConfig(dto, user.id);
  }

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LOGO_BYTES },
    }),
  )
  @Post('logo')
  uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settings.uploadLogo(file.buffer, file.mimetype, user.id);
  }

  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('logo')
  async removeLogo(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.settings.removeLogo(user.id);
  }
}
