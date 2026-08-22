import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class MoveInventoryItemDto {
  @ApiProperty({
    description: 'Target room. The target location is derived from the room.',
  })
  @IsUUID()
  toRoomId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
