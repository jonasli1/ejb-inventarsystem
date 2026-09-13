import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '../../generated/prisma/client';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { MANUALLY_ASSIGNABLE_INVENTORY_STATUSES } from '../inventory-status';

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
    description:
      'Inventory number. Optional and never auto-generated; case-insensitively unique among non-retired items only - freed up again once an item is retired.',
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
  status?: InventoryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNumber?: string;

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
    description:
      'Purchase date. Optional, left empty when omitted. On update, send `null` to clear an already-set date.',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string | null;

  @ApiPropertyOptional({
    description:
      'Date of the next scheduled DGUV V3 electrical safety check. On update, send `null` to clear an already-set date.',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  nextDguvV3Check?: string | null;
}
