import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
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
    description: 'Return items grouped by article instead of a flat list.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  grouped?: boolean = false;
}
