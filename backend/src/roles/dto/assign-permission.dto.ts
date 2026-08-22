import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignPermissionDto {
  @ApiProperty()
  @IsUUID()
  permissionId: string;
}
