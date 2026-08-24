import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateGroupOrganizationScopeDto {
  @ApiProperty()
  @IsUUID()
  organizationId: string;

  @ApiPropertyOptional({
    description:
      'Restrict this scope to a single unit. Omit for the whole organization.',
  })
  @IsOptional()
  @IsUUID()
  organizationUnitId?: string;
}
