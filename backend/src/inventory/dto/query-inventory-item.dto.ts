import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// `@Type(() => Boolean)` would turn the string "false" into `true`, since
// `Boolean("false")` is truthy in JS. Query params always arrive as strings,
// so booleans need an explicit string-aware transform instead.
function toBoolean({ value }: { value: unknown }): unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return value;
}

export class QueryInventoryItemDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @ApiPropertyOptional({ description: "Filter by the article's category." })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiPropertyOptional({ description: 'Owner organization (level 1)' })
  @IsOptional()
  @IsUUID()
  ownerOrganizationId?: string;

  @ApiPropertyOptional({ description: 'Owner organization unit (level 2)' })
  @IsOptional()
  @IsUUID()
  ownerUnitId?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive partial match on inventory number, serial number, article name/manufacturer, owner organization, or location.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Return items grouped by article instead of a flat list. Grouped mode still uses page/pageSize (bounded by article count); the flat list uses cursor/limit instead - see below.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  grouped?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Keyset pagination cursor for the flat (non-grouped) list, from a previous response\'s nextCursor. Ignored when grouped=true.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: 200,
    description:
      'Page size for the flat (non-grouped) list. Ignored when grouped=true (use pageSize there instead).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
