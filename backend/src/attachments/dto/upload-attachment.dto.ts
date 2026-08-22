import { ApiProperty } from '@nestjs/swagger';
import { AttachmentCategory } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UploadAttachmentDto {
  @ApiProperty({ enum: AttachmentCategory })
  @IsEnum(AttachmentCategory)
  category: AttachmentCategory;
}
