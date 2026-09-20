import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UpdateLoanItemDto {
  @ApiPropertyOptional({
    description:
      'Specific inventory item to keep/add. Mutually exclusive with articleId.',
  })
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @ApiPropertyOptional({
    description:
      'Article to keep/resolve a given quantity of units for (for articles with loanableByQuantity). Mutually exclusive with inventoryItemId.',
  })
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number = 1;
}

// All fields stay optional here (unlike CreateLoanDto): this is a partial
// PATCH, and editing an already-issued or legacy loan must not force
// re-supplying every field. Editing a not-yet-issued loan resets its status
// back to "requested" - see LoansService.update.
export class UpdateLoanDto {
  @ApiPropertyOptional({
    description: "The loan's primary display name.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

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
