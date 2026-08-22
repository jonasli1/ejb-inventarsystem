import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AttachmentEntityType } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { QueryAttachmentDto } from './dto/query-attachment.dto';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function parseEntityType(value: string): AttachmentEntityType {
  if (
    !Object.values(AttachmentEntityType).includes(value as AttachmentEntityType)
  ) {
    throw new BadRequestException(`Unknown entity type "${value}".`);
  }
  return value as AttachmentEntityType;
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  async list(
    @Query() query: QueryAttachmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.attachments.assertPermission(query.entityType, user, 'read');
    return this.attachments.list(
      query.entityType,
      query.entityId,
      query.category,
    );
  }

  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  @Post(':entityType/:entityId')
  async upload(
    @Param('entityType') entityTypeParam: string,
    @Param('entityId') entityId: string,
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const entityType = parseEntityType(entityTypeParam);
    this.attachments.assertPermission(entityType, user, 'write');
    return this.attachments.save(
      entityType,
      entityId,
      dto.category,
      file,
      user.id,
    );
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await this.attachments.getFileForDownload(id);
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
    });
    return new StreamableFile(
      createReadStream(
        this.attachments.resolveAbsolutePath(attachment.storageKey),
      ),
    );
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const attachment = await this.attachments.findById(id);
    this.attachments.assertPermission(attachment.entityType, user, 'write');
    await this.attachments.remove(id, user.id);
  }
}
