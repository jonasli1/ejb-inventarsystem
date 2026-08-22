import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class SaveAsTemplateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;
}

export class CreateLoanItemDto {
  @ApiPropertyOptional({
    description:
      'Specific inventory item to check out. Mutually exclusive with articleId.',
  })
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @ApiPropertyOptional({
    description:
      'Article to auto-assign available units from (for BULK/CONSUMABLE). Mutually exclusive with inventoryItemId.',
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

export class CreateLoanDto {
  @ApiPropertyOptional({
    description: 'Internal borrower (references a User).',
  })
  @IsOptional()
  @IsUUID()
  borrowerPersonId?: string;

  @ApiPropertyOptional({ description: 'Free-text / external borrower name.' })
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

  @ApiPropertyOptional({
    description:
      'Planned checkout / start date, may be in the future. Defaults to now when omitted.',
  })
  @IsOptional()
  @IsDateString()
  checkoutDate?: string;

  @ApiPropertyOptional({ description: 'Planned return date.' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'For loans.manage/loans.administer holders, who would otherwise get an auto-approved loan: create it as "requested" instead.',
  })
  @IsOptional()
  @IsBoolean()
  forceRequested?: boolean;

  @ApiPropertyOptional({
    description:
      'loans.administer only: also save the resolved items (by article) as a reusable template.',
    type: SaveAsTemplateDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SaveAsTemplateDto)
  saveAsTemplate?: SaveAsTemplateDto;

  @ApiProperty({ type: [CreateLoanItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLoanItemDto)
  items: CreateLoanItemDto[];
}
