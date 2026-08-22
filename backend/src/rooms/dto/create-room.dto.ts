import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty()
  @IsUUID()
  locationId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;
}
