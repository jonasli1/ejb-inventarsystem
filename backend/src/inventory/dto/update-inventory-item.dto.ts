import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateInventoryItemDto } from './create-inventory-item.dto';

export class UpdateInventoryItemDto extends PartialType(
  OmitType(CreateInventoryItemDto, ['locationId', 'roomId'] as const),
) {}
