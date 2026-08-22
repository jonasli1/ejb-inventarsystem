import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class IssueLoanItemDto {
  @ApiProperty()
  @IsUUID()
  loanItemId: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    description:
      'Override the condition captured at hand-out (defaults to the current inventory item condition).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  checkedOutCondition?: number;
}

export class IssueLoanDto {
  @ApiPropertyOptional({ type: [IssueLoanItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueLoanItemDto)
  items?: IssueLoanItemDto[];
}
