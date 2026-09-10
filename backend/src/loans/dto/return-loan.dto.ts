import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { InventoryStatus } from '../../generated/prisma/client';

// A returned item can only land in one of these states - never back into
// "installed" (that's not a loan-return outcome) and never "borrowed"
// (that would just be a bug), keeping the status graph consistent.
const RETURNABLE_TARGET_STATUSES = [
  InventoryStatus.available,
  InventoryStatus.maintenance,
  InventoryStatus.defect,
  InventoryStatus.retired,
] as const;

export class ReturnLoanItemDto {
  @ApiProperty()
  @IsUUID()
  loanItemId: string;

  @ApiPropertyOptional({
    enum: RETURNABLE_TARGET_STATUSES,
    default: InventoryStatus.available,
    description:
      'Status to set the inventory item to after return, e.g. "defect" for damaged items.',
  })
  @IsOptional()
  @IsIn(RETURNABLE_TARGET_STATUSES)
  newStatus?: InventoryStatus = InventoryStatus.available;
}

export class ReturnLoanDto {
  @ApiProperty({ type: [ReturnLoanItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLoanItemDto)
  items: ReturnLoanItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
