import { ApiProperty } from '@nestjs/swagger';
import { ThemePreference } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateThemeDto {
  @ApiProperty({ enum: ThemePreference })
  @IsEnum(ThemePreference)
  theme: ThemePreference;
}
