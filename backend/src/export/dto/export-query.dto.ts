import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export type ExportFormat = 'xlsx' | 'pdf';

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: ['xlsx', 'pdf'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['xlsx', 'pdf'])
  format?: ExportFormat = 'xlsx';
}

export class ExportInventoryQueryDto extends ExportQueryDto {
  @ApiPropertyOptional({
    enum: ['owner', 'location'],
    description: 'Group the exported inventory by owner or by location.',
  })
  @IsOptional()
  @IsIn(['owner', 'location'])
  groupBy?: 'owner' | 'location';
}

export class ExportArticlesQueryDto extends ExportQueryDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'One or more article IDs. Omit to export all articles.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : value,
  )
  @IsUUID(undefined, { each: true })
  articleIds?: string[];
}
