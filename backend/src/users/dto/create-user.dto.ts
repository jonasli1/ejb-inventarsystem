import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/utils/normalize-email';

export class CreateUserDto {
  @ApiProperty()
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  displayName: string;

  @ApiPropertyOptional({
    description:
      'If provided, creates a local (username/password) login for this user.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
