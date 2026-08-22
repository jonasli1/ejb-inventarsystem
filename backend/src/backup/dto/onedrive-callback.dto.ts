import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class OneDriveCallbackDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  code: string;
}
