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

// Address/contact/notes/date changes never require re-approval. Items can be
// replaced at any status short of "completed" (see LoansService.update for
// the exact inventory-status side effects this can trigger on an issued loan).
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
