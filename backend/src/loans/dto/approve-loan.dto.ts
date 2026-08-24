import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class ApproveLoanDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Specific loan item ids to approve. Omit to approve every item the actor is authorized for.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];
}
