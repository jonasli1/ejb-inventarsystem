import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from '../../common/utils/normalize-email';

export class ForgotPasswordDto {
  @ApiProperty()
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
