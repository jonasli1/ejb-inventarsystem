import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { InventoryStatus } from '@prisma/client';

export class ReturnLoanItemDto {
  @ApiProperty()
  @IsUUID()
  loanItemId: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    description:
      'Updated condition percentage, only relevant for CONSUMABLE articles.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  returnedCondition?: number;

  @ApiPropertyOptional({
    enum: InventoryStatus,
    default: InventoryStatus.available,
    description:
      'Status to set the inventory item to after return, e.g. "defect" for damaged items.',
  })
  @IsOptional()
  @IsEnum(InventoryStatus)
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
