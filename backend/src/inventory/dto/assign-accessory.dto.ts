import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignAccessoryDto {
  @ApiProperty({
    description: 'The inventory item to attach as an accessory of this one.',
  })
  @IsUUID()
  accessoryItemId: string;
}
