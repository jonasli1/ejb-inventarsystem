import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { QueryInventoryItemDto } from '../../inventory/dto/query-inventory-item.dto';
import { QueryArticleDto } from '../../articles/dto/query-article.dto';

export type ExportFormat = 'xlsx' | 'pdf';

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: ['xlsx', 'pdf'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['xlsx', 'pdf'])
  format?: ExportFormat = 'xlsx';
}

// Extends the list's own filter DTO (not ExportQueryDto) so the export is
// guaranteed to accept - and, via InventoryService.buildWhere, apply -
// exactly the same filter/search fields the inventory list uses. Pagination
// fields it inherits (page/pageSize/grouped/cursor/limit) are simply
// ignored by exportInventory(); grouping deliberately has no effect on the
// export, which is always one flat, naturally-sorted list.
export class ExportInventoryQueryDto extends QueryInventoryItemDto {
  @ApiPropertyOptional({ enum: ['xlsx', 'pdf'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['xlsx', 'pdf'])
  format?: ExportFormat = 'xlsx';
}

// Same reasoning as ExportInventoryQueryDto - extends the article list's own
// filter DTO so export matches exactly what's filtered/searched.
export class ExportArticlesQueryDto extends QueryArticleDto {
  @ApiPropertyOptional({ enum: ['xlsx', 'pdf'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['xlsx', 'pdf'])
  format?: ExportFormat = 'xlsx';

  @ApiPropertyOptional({
    type: [String],
    description:
      'One or more article IDs. Omit to export all (filtered) articles.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : value,
  )
  @IsUUID(undefined, { each: true })
  articleIds?: string[];
}
