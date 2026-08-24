import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class UpdateLoanItemDto {
  @ApiPropertyOptional({ description: 'Specific inventory item.' })
  @IsUUID()
  inventoryItemId: string;
}

// All fields stay optional here (unlike CreateLoanDto): this is a partial
// PATCH, and editing an already-issued or legacy loan must not force
// re-supplying every field. Editing a not-yet-issued loan resets its status
// back to "requested" - see LoansService.update.
export class UpdateLoanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  borrowerPersonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  borrowerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  borrowerStreet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  borrowerCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  borrowerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  borrowerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkoutDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: [UpdateLoanItemDto],
    description: "When provided, replaces the loan's full item set.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateLoanItemDto)
  items?: UpdateLoanItemDto[];
}
