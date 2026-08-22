import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { BackupService } from './backup.service';
import { UpdateBackupConfigDto } from './dto/update-backup-config.dto';
import { OneDriveCallbackDto } from './dto/onedrive-callback.dto';

const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

@ApiTags('backup')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('config')
  getConfig() {
    return this.backupService.getConfig();
  }

  @Put('config')
  updateConfig(
    @Body() dto: UpdateBackupConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.backupService.updateConfig(dto, user.id);
  }

  @Post('config/test')
  testConnection() {
    return this.backupService.testConnection();
  }

  @Get('onedrive/authorize-url')
  async getOneDriveAuthorizeUrl() {
    return { url: await this.backupService.getOneDriveAuthorizationUrl() };
  }

  @Post('onedrive/callback')
  async oneDriveCallback(
    @Body() dto: OneDriveCallbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.backupService.handleOneDriveCallback(dto.code, user.id);
    return { connected: true };
  }

  @Get('export')
  async export(@Res({ passthrough: true }) res: Response) {
    const file = await this.backupService.exportBackup();
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_BYTES },
    }),
  )
  @Post('import')
  async import(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No backup file uploaded.');
    }
    await this.backupService.importBackup(file.buffer, user.id);
    return { restored: true };
  }
}
