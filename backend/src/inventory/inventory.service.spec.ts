import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const manageUser: AuthenticatedUser = {
  id: 'user-manage',
  email: 'manage@example.com',
  displayName: 'Manage User',
  permissions: ['inventory.update'],
};
const changeInvNumUser: AuthenticatedUser = {
  id: 'user-invnum',
  email: 'invnum@example.com',
  displayName: 'InvNum User',
  permissions: ['inventory.change_inventory_number'],
};
const bothUser: AuthenticatedUser = {
  id: 'user-both',
  email: 'both@example.com',
  displayName: 'Both User',
  permissions: ['inventory.update', 'inventory.change_inventory_number'],
};

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    article: { findFirst: jest.Mock; findFirstOrThrow: jest.Mock };
    room: { findFirst: jest.Mock };
    organizationUnit: { findFirst: jest.Mock };
    inventoryItem: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    stockMovement: { create: jest.Mock; findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let attachments: { list: jest.Mock };

  const baseDto: CreateInventoryItemDto = {
    articleId: 'article-1',
    locationId: 'location-1',
    roomId: 'room-1',
    ownerOrganizationId: 'org-1',
    ownerUnitId: 'unit-1',
  };

  beforeEach(() => {
    prisma = {
      article: {
        findFirst: jest.fn().mockResolvedValue({ id: 'article-1' }),
        findFirstOrThrow: jest.fn(),
      },
      room: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'room-1', locationId: 'location-1' }),
      },
      organizationUnit: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'unit-1', organizationId: 'org-1' }),
      },
      inventoryItem: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'item-1', ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'item-1', ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        // Default: no active inventory-number conflict, item not found by id.
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest
        .fn()
        .mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    attachments = { list: jest.fn().mockResolvedValue([]) };

    service = new InventoryService(
      prisma as unknown as PrismaService,
      attachments as unknown as AttachmentsService,
    );
  });

  it('defaults status to "available" when omitted', async () => {
    await service.create(baseDto, 'user-1');
    const createCall = prisma.inventoryItem.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('available');
  });

  it('never auto-generates an inventory number - stays undefined when omitted', async () => {
    await service.create(baseDto, 'user-1');
    const createCall = prisma.inventoryItem.create.mock.calls[0][0];
    expect(createCall.data.inventoryNumber).toBeUndefined();
  });

  it('uses a provided inventory number verbatim', async () => {
    await service.create(
      { ...baseDto, inventoryNumber: 'CUSTOM-001' },
      'user-1',
    );
    const createCall = prisma.inventoryItem.create.mock.calls[0][0];
    expect(createCall.data.inventoryNumber).toBe('CUSTOM-001');
  });

  it('rejects creating with an inventory number already used by an active item', async () => {
    prisma.inventoryItem.findFirst.mockResolvedValue({ id: 'other-item' });
    await expect(
      service.create({ ...baseDto, inventoryNumber: 'DUP-001' }, 'user-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('passes nextDguvV3Check through as a Date', async () => {
    await service.create(
      { ...baseDto, nextDguvV3Check: '2027-03-01' },
      'user-1',
    );
    const createCall = prisma.inventoryItem.create.mock.calls[0][0];
    expect(createCall.data.nextDguvV3Check).toEqual(new Date('2027-03-01'));
  });

  it('rejects when the room does not belong to the given location', async () => {
    prisma.room.findFirst.mockResolvedValue({
      id: 'room-1',
      locationId: 'other-location',
    });
    await expect(service.create(baseDto, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects when the room does not exist', async () => {
    prisma.room.findFirst.mockResolvedValue(null);
    await expect(service.create(baseDto, 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects when the organization unit does not belong to the given organization', async () => {
    prisma.organizationUnit.findFirst.mockResolvedValue({
      id: 'unit-1',
      organizationId: 'other-org',
    });
    await expect(service.create(baseDto, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects when the article does not exist', async () => {
    prisma.article.findFirst.mockResolvedValue(null);
    await expect(service.create(baseDto, 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('count', () => {
    it('returns the total non-deleted item count', async () => {
      prisma.inventoryItem.count.mockResolvedValue(42);
      await expect(service.count()).resolves.toEqual({ count: 42 });
      expect(prisma.inventoryItem.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });
  });

  describe('findAll', () => {
    it('filters by the article category via a relation filter', async () => {
      await service.findAll({ categoryId: 'category-1' });
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            article: { categoryId: 'category-1' },
          }),
        }),
      );
    });

    it('includes the article category name in the free-text search', async () => {
      await service.findAll({ search: 'Kabel' });
      const call = prisma.inventoryItem.findMany.mock.calls[0][0];
      // Search contributes its own OR, nested under an AND alongside the
      // (when present) cursor OR - they can't share one top-level OR key.
      expect(call.where.AND[0].OR).toContainEqual({
        article: {
          category: { name: { contains: 'Kabel', mode: 'insensitive' } },
        },
      });
    });

    it('includes alias-matched article ids when the raw alias query finds hits', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'article-alias-1' }]);
      await service.findAll({ search: 'Beamer' });
      const call = prisma.inventoryItem.findMany.mock.calls[0][0];
      expect(call.where.AND[0].OR).toContainEqual({
        articleId: { in: ['article-alias-1'] },
      });
    });

    it('matches inventory numbers ignoring "0" (e.g. search "INV-KABEL-5" finds "INV-KABEL-005")', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([]) // alias match: none
        .mockResolvedValueOnce([{ id: 'item-leading-zero' }]); // normalized inventory-number match
      await service.findAll({ search: 'INV-KABEL-5' });
      const call = prisma.inventoryItem.findMany.mock.calls[0][0];
      expect(call.where.AND[0].OR).toContainEqual({
        id: { in: ['item-leading-zero'] },
      });
    });

    it('matches inventory numbers ignoring spaces (e.g. search "EJB831" finds "EJB 0831")', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([]) // alias match: none
        .mockResolvedValueOnce([{ id: 'item-with-space' }]); // normalized inventory-number match
      await service.findAll({ search: 'EJB831' });
      const call = prisma.inventoryItem.findMany.mock.calls[0][0];
      expect(call.where.AND[0].OR).toContainEqual({
        id: { in: ['item-with-space'] },
      });
    });

    it('does not run the normalized inventory-number match when the search term is only "0"s and spaces', async () => {
      await service.findAll({ search: '0 0' });
      // Only the alias-match raw query should run - a normalized comparison
      // against an empty pattern would otherwise match every item via LIKE '%%'.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('orders the flat list by (inventoryNumber, id) for stable, naturally-sorted keyset pagination', async () => {
      await service.findAll({});
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('requests limit+1 rows and returns a nextCursor when more rows exist', async () => {
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `item-${i}`,
        createdAt: new Date(2026, 0, i + 1),
      }));
      prisma.inventoryItem.findMany.mockResolvedValue(rows);

      const result = (await service.findAll({ limit: 50 })) as {
        data: unknown[];
        nextCursor: string | null;
      };

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }),
      );
      expect(result.data).toHaveLength(50);
      expect(result.nextCursor).toBeTruthy();
    });

    it('returns no nextCursor once fewer rows than the limit come back', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        { id: 'item-1', createdAt: new Date() },
      ]);
      const result = (await service.findAll({ limit: 50 })) as {
        nextCursor: string | null;
      };
      expect(result.nextCursor).toBeNull();
    });

    it('translates a non-null-inventoryNumber cursor into a keyset filter that also includes null-inventoryNumber rows (NULLS LAST), AND-composed with other filters', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ inventoryNumber: 'Adam-8', id: 'item-5' }),
      ).toString('base64url');

      await service.findAll({ cursor, status: 'available' });

      const call = prisma.inventoryItem.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('available');
      expect(call.where.AND[0].OR).toEqual([
        { inventoryNumber: { gt: 'Adam-8' } },
        { inventoryNumber: 'Adam-8', id: { gt: 'item-5' } },
        { inventoryNumber: null },
      ]);
    });

    it('translates a null-inventoryNumber cursor into a filter for only further null-inventoryNumber rows', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ inventoryNumber: null, id: 'item-5' }),
      ).toString('base64url');

      await service.findAll({ cursor });

      const call = prisma.inventoryItem.findMany.mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({
        inventoryNumber: null,
        id: { gt: 'item-5' },
      });
    });
  });

  describe('getMovements', () => {
    it('throws NotFoundException for an unknown item', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue(null);
      await expect(service.getMovements('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('includes the related loan item (for the "zur Ausleihe" link/photos)', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({ id: 'item-1' });

      await service.getMovements('item-1');

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            loanItem: { select: { id: true, loanId: true } },
          }),
        }),
      );
    });
  });

  describe('update', () => {
    const existingItem = {
      id: 'item-1',
      inventoryNumber: 'INV-OLD',
      status: 'available',
      article: { id: 'article-1' },
      ownerOrganizationId: 'org-1',
      ownerUnitId: 'unit-1',
    };

    beforeEach(() => {
      // Distinguish findOne's lookup-by-id from
      // assertInventoryNumberAvailable's conflict check (only the latter
      // filters on `inventoryNumber`) so both can share one mock.
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { inventoryNumber?: unknown } } = {}) => {
          if (where?.inventoryNumber) return Promise.resolve(null);
          return Promise.resolve(existingItem);
        },
      );
    });

    it('rejects changing the inventory number without inventory.change_inv_num, even with inventory.manage', async () => {
      await expect(
        service.update('item-1', { inventoryNumber: 'INV-NEW' }, manageUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows changing the inventory number with only inventory.change_inv_num (no inventory.manage)', async () => {
      const result = await service.update(
        'item-1',
        { inventoryNumber: 'INV-NEW' },
        changeInvNumUser,
      );
      expect(result.inventoryNumber).toBe('INV-NEW');
    });

    it('rejects setting the inventory number to one already used by another active item', async () => {
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { inventoryNumber?: unknown } } = {}) => {
          if (where?.inventoryNumber)
            return Promise.resolve({ id: 'other-item' });
          return Promise.resolve(existingItem);
        },
      );
      await expect(
        service.update('item-1', { inventoryNumber: 'TAKEN' }, bothUser),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects changing other fields without inventory.manage, even with inventory.change_inv_num', async () => {
      await expect(
        service.update('item-1', { notes: 'hello' }, changeInvNumUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows changing other fields with inventory.manage (no inventory.change_inv_num)', async () => {
      const result = await service.update(
        'item-1',
        { notes: 'hello' },
        manageUser,
      );
      expect(result.notes).toBe('hello');
    });

    it('clears purchaseDate when explicitly set to null', async () => {
      const result = await service.update(
        'item-1',
        { purchaseDate: null },
        manageUser,
      );
      expect(result.purchaseDate).toBeNull();
    });

    it('clears nextDguvV3Check when explicitly set to null', async () => {
      const result = await service.update(
        'item-1',
        { nextDguvV3Check: null },
        manageUser,
      );
      expect(result.nextDguvV3Check).toBeNull();
    });

    it('clears purchasePrice when explicitly set to null', async () => {
      const result = await service.update(
        'item-1',
        { purchasePrice: null },
        manageUser,
      );
      expect(result.purchasePrice).toBeNull();
    });

    it('allows changing both the inventory number and other fields when the actor has both permissions', async () => {
      const result = await service.update(
        'item-1',
        { inventoryNumber: 'INV-NEW', notes: 'hello' },
        bothUser,
      );
      expect(result.inventoryNumber).toBe('INV-NEW');
      expect(result.notes).toBe('hello');
    });

    it('allows a valid status transition (available -> maintenance)', async () => {
      const result = await service.update(
        'item-1',
        { status: 'maintenance' },
        manageUser,
      );
      expect(result.status).toBe('maintenance');
    });

    it('rejects an invalid status transition (retired is terminal)', async () => {
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { inventoryNumber?: unknown } } = {}) => {
          if (where?.inventoryNumber) return Promise.resolve(null);
          return Promise.resolve({ ...existingItem, status: 'retired' });
        },
      );
      await expect(
        service.update('item-1', { status: 'available' }, manageUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects changing status away from "borrowed" via a direct update (must go through loan return)', async () => {
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { inventoryNumber?: unknown } } = {}) => {
          if (where?.inventoryNumber) return Promise.resolve(null);
          return Promise.resolve({ ...existingItem, status: 'borrowed' });
        },
      );
      await expect(
        service.update('item-1', { status: 'available' }, manageUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('accessories', () => {
    it('refuses to assign an item as its own accessory', async () => {
      await expect(
        service.assignAccessory('item-1', 'item-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to assign an accessory that already has accessories of its own', async () => {
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { id?: string } } = {}) => {
          if (where?.id === 'parent-1')
            return Promise.resolve({ id: 'parent-1', parentItemId: null });
          if (where?.id === 'candidate-1')
            return Promise.resolve({
              id: 'candidate-1',
              parentItemId: null,
              status: 'available',
              accessories: [{ id: 'grandchild-1' }],
            });
          return Promise.resolve(null);
        },
      );
      await expect(
        service.assignAccessory('parent-1', 'candidate-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to assign an accessory to an item that is itself an accessory', async () => {
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { id?: string } } = {}) => {
          if (where?.id === 'parent-1')
            return Promise.resolve({ id: 'parent-1', parentItemId: 'gp-1' });
          if (where?.id === 'candidate-1')
            return Promise.resolve({
              id: 'candidate-1',
              parentItemId: null,
              status: 'available',
              accessories: [],
            });
          return Promise.resolve(null);
        },
      );
      await expect(
        service.assignAccessory('parent-1', 'candidate-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('assigns an eligible accessory', async () => {
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { id?: string } } = {}) => {
          if (where?.id === 'parent-1')
            return Promise.resolve({ id: 'parent-1', parentItemId: null });
          if (where?.id === 'candidate-1')
            return Promise.resolve({
              id: 'candidate-1',
              parentItemId: null,
              status: 'available',
              accessories: [],
            });
          return Promise.resolve(null);
        },
      );
      await service.assignAccessory('parent-1', 'candidate-1');
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: { parentItemId: 'parent-1', separatelyLoanable: false },
        }),
      );
    });

    it('assigns an eligible accessory as separately loanable when requested', async () => {
      prisma.inventoryItem.findFirst.mockImplementation(
        ({ where }: { where?: { id?: string } } = {}) => {
          if (where?.id === 'parent-1')
            return Promise.resolve({ id: 'parent-1', parentItemId: null });
          if (where?.id === 'candidate-1')
            return Promise.resolve({
              id: 'candidate-1',
              parentItemId: null,
              status: 'available',
              accessories: [],
            });
          return Promise.resolve(null);
        },
      );
      await service.assignAccessory('parent-1', 'candidate-1', true);
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: { parentItemId: 'parent-1', separatelyLoanable: true },
        }),
      );
    });
  });
});
