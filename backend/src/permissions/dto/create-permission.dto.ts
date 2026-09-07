import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'inventory.update' })
  @IsString()
  @Matches(/^[a-z]+\.[a-z_]+$/, {
    message:
      'key muss dem Format "ressource.aktion" entsprechen, z. B. "inventory.update"',
  })
  key: string;

  @ApiPropertyOptional({ example: 'Inventarobjekte bearbeiten' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
