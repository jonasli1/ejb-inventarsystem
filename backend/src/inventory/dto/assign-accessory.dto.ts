import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AssignAccessoryDto {
  @ApiProperty({
    description: 'The inventory item to attach as an accessory of this one.',
  })
  @IsUUID()
  accessoryItemId: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'When true, this accessory may also be checked out on its own, without its main object. Off by default (bundled-only).',
  })
  @IsOptional()
  @IsBoolean()
  separatelyLoanable?: boolean;
}
