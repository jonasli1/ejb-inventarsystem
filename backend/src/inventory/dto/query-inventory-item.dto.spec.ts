import { plainToInstance } from 'class-transformer';
import { QueryInventoryItemDto } from './query-inventory-item.dto';

describe('QueryInventoryItemDto', () => {
  it('parses the query-string value "false" as boolean false', () => {
    const dto = plainToInstance(QueryInventoryItemDto, { grouped: 'false' });
    expect(dto.grouped).toBe(false);
  });

  it('parses the query-string value "true" as boolean true', () => {
    const dto = plainToInstance(QueryInventoryItemDto, { grouped: 'true' });
    expect(dto.grouped).toBe(true);
  });

  it('defaults to false when omitted', () => {
    const dto = plainToInstance(QueryInventoryItemDto, {});
    expect(dto.grouped).toBe(false);
  });
});
