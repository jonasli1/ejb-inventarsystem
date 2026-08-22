import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttachmentCategory, AttachmentEntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class QueryAttachmentDto {
  @ApiProperty({ enum: AttachmentEntityType })
  @IsEnum(AttachmentEntityType)
  entityType: AttachmentEntityType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  entityId: string;

  @ApiPropertyOptional({ enum: AttachmentCategory })
  @IsOptional()
  @IsEnum(AttachmentCategory)
  category?: AttachmentCategory;
}
