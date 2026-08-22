import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'inventory.manage' })
  @IsString()
  @Matches(/^[a-z]+\.[a-z]+$/, {
    message:
      'key must be in the form "resource.action", e.g. "inventory.manage"',
  })
  key: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
