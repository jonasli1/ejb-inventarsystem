import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

export class PasskeyRegisterVerifyDto {
  @ApiProperty()
  @IsString()
  challengeId: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response: RegistrationResponseJSON;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceLabel?: string;
}

export class PasskeyLoginOptionsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class PasskeyLoginVerifyDto {
  @ApiProperty()
  @IsString()
  challengeId: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response: AuthenticationResponseJSON;
}
