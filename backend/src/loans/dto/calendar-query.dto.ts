import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CalendarQueryDto {
  @ApiProperty({ description: 'Range start (inclusive).' })
  @IsDateString()
  from: string;

  @ApiProperty({ description: 'Range end (inclusive).' })
  @IsDateString()
  to: string;
}
