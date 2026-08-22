import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// `borrowed` is only ever set by the loan workflow (checkout/return), never
// through a direct create/update call — otherwise an item could be marked
// "borrowed" without an actual loan record behind it.
export const MANUALLY_ASSIGNABLE_INVENTORY_STATUSES = Object.values(
  InventoryStatus,
).filter((status) => status !== InventoryStatus.borrowed);

export class CreateInventoryItemDto {
  @ApiProperty()
  @IsUUID()
  articleId: string;

  @ApiProperty()
  @IsUUID()
  locationId: string;

  @ApiProperty()
  @IsUUID()
  roomId: string;

  @ApiProperty({ description: 'Owner organization (level 1)' })
  @IsUUID()
  ownerOrganizationId: string;

  @ApiProperty({
    description:
      'Owner organization unit (level 2), must belong to ownerOrganizationId',
  })
  @IsUUID()
  ownerUnitId: string;

  @ApiPropertyOptional({
    description: 'Unique inventory number. Auto-generated when omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  inventoryNumber?: string;

  @ApiPropertyOptional({
    enum: MANUALLY_ASSIGNABLE_INVENTORY_STATUSES,
    default: InventoryStatus.available,
    description:
      '"borrowed" cannot be set directly; it is managed by the loan workflow.',
  })
  @IsOptional()
  @IsIn(MANUALLY_ASSIGNABLE_INVENTORY_STATUSES)
  status?: InventoryStatus = InventoryStatus.available;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    description: 'Only allowed for CONSUMABLE articles.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  conditionPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Purchase price in the local currency, e.g. 149.99',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({
    description: 'Purchase date. Defaults to today when omitted.',
  })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;
}
