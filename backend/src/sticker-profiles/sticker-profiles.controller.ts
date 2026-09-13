import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { Audited } from '../audit/audited.decorator';
import { StickerProfilesService } from './sticker-profiles.service';
import { CreateStickerProfileDto } from './dto/create-sticker-profile.dto';
import { UpdateStickerProfileDto } from './dto/update-sticker-profile.dto';

// Readable by any authenticated user (no @RequirePermissions on the GET
// routes) - every device/user needs these to run the on-device sticker
// scanner, regardless of admin rights. Only create/update/delete are gated.
@ApiTags('sticker-profiles')
@ApiBearerAuth()
@Controller('sticker-profiles')
export class StickerProfilesController {
  constructor(
    private readonly stickerProfilesService: StickerProfilesService,
  ) {}

  @Get()
  findAll() {
    return this.stickerProfilesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stickerProfilesService.findOne(id);
  }

  @Audited('StickerProfile', 'other')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE_STICKER_PROFILES)
  @Post()
  create(@Body() dto: CreateStickerProfileDto) {
    return this.stickerProfilesService.create(dto);
  }

  @Audited('StickerProfile', 'other')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE_STICKER_PROFILES)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStickerProfileDto,
  ) {
    return this.stickerProfilesService.update(id, dto);
  }

  @Audited('StickerProfile', 'other')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE_STICKER_PROFILES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.stickerProfilesService.remove(id);
  }
}
