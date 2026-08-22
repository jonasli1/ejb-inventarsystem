import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'The organization this group belongs to. Members inherit this as their organization for the org-scoped loans.manage permission.',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
