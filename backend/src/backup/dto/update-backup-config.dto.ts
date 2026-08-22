import { ApiPropertyOptional } from '@nestjs/swagger';
import { BackupDestinationType, BackupFrequency } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateBackupConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: BackupFrequency })
  @IsOptional()
  @IsEnum(BackupFrequency)
  frequency?: BackupFrequency;

  @ApiPropertyOptional({ enum: BackupDestinationType })
  @IsOptional()
  @IsEnum(BackupDestinationType)
  destinationType?: BackupDestinationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sftpHost?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  sftpPort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sftpUsername?: string;

  @ApiPropertyOptional({
    description:
      'Only sent when changing the password; omit to keep the current one.',
  })
  @IsOptional()
  @IsString()
  sftpPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sftpRemotePath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  onedriveFolderPath?: string;
}
