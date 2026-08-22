import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateBlackoutPeriodDto {
  @ApiProperty({ description: 'First day (inclusive) with no loans possible.' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Last day (inclusive) with no loans possible.' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
