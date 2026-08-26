import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInventoryItemDto } from './create-inventory-item.dto';

const BASE = {
  articleId: '11111111-1111-1111-1111-111111111111',
  locationId: '22222222-2222-2222-2222-222222222222',
  roomId: '33333333-3333-3333-3333-333333333333',
  ownerOrganizationId: '44444444-4444-4444-4444-444444444444',
  ownerUnitId: '55555555-5555-5555-5555-555555555555',
};

describe('CreateInventoryItemDto', () => {
  it('rejects "borrowed" as a manually assignable status', async () => {
    const dto = plainToInstance(CreateInventoryItemDto, {
      ...BASE,
      status: 'borrowed',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('accepts the new "installed" status', async () => {
    const dto = plainToInstance(CreateInventoryItemDto, {
      ...BASE,
      status: 'installed',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(false);
  });

  it('accepts an omitted status - no class-level default, so it stays undefined on the DTO', async () => {
    // Deliberately no default value initializer on the `status` field: a
    // PartialType(CreateInventoryItemDto) (used by UpdateInventoryItemDto)
    // would otherwise leak that default into every PATCH, permanently
    // "changing" status to "available" even when the caller never sent it.
    // InventoryService.create() applies the "available" default explicitly.
    const dto = plainToInstance(CreateInventoryItemDto, BASE);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(false);
    expect(dto.status).toBeUndefined();
  });
});
