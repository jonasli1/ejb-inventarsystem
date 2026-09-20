import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateInventoryItemDto } from './create-inventory-item.dto';

export class UpdateInventoryItemDto extends PartialType(
  OmitType(CreateInventoryItemDto, ['locationId', 'roomId'] as const),
) {
  @ApiPropertyOptional({
    description:
      'Only meaningful while this item is an accessory (parentItemId set): when true, it may also be checked out on its own, without its main object.',
  })
  @IsOptional()
  @IsBoolean()
  separatelyLoanable?: boolean;
}
