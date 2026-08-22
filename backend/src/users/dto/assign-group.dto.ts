import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignGroupDto {
  @ApiProperty()
  @IsUUID()
  groupId: string;
}
