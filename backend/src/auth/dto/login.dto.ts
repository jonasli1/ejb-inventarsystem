import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/utils/normalize-email';

export class LoginDto {
  @ApiProperty()
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;
}
