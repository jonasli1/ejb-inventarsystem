import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    article: { findFirst: jest.Mock; findFirstOrThrow: jest.Mock };
    room: { findFirst: jest.Mock };
    organizationUnit: { findFirst: jest.Mock };
    inventoryItem: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    loanItem: { findFirst: jest.Mock };
    stockMovement: { create: jest.Mock };
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
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'article-1', type: 'UNIQUE' }),
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
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      loanItem: { findFirst: jest.fn().mockResolvedValue(null) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
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

  it('rejects conditionPercent for a non-CONSUMABLE article', async () => {
    await expect(
      service.create({ ...baseDto, conditionPercent: 80 }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts conditionPercent for a CONSUMABLE article', async () => {
    prisma.article.findFirst.mockResolvedValue({
      id: 'article-1',
      type: 'CONSUMABLE',
    });
    const result = await service.create(
      { ...baseDto, conditionPercent: 80 },
      'user-1',
    );
    expect(result).toBeDefined();
    expect(prisma.inventoryItem.create).toHaveBeenCalled();
  });

  it('auto-generates an inventory number in the INV-XXXX-XXXX format when omitted', async () => {
    await service.create(baseDto, 'user-1');
    const createCall = prisma.inventoryItem.create.mock.calls[0][0];
    expect(createCall.data.inventoryNumber).toMatch(
      /^INV-[0-9A-Z]+-[0-9A-F]{4}$/,
    );
  });

  it('uses a provided inventory number verbatim', async () => {
    await service.create(
      { ...baseDto, inventoryNumber: 'CUSTOM-001' },
      'user-1',
    );
    const createCall = prisma.inventoryItem.create.mock.calls[0][0];
    expect(createCall.data.inventoryNumber).toBe('CUSTOM-001');
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
      expect(call.where.OR).toContainEqual({
        article: {
          category: { name: { contains: 'Kabel', mode: 'insensitive' } },
        },
      });
    });
  });

  describe('getLastLoanPhotos', () => {
    it('throws NotFoundException for an unknown item', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue(null);
      await expect(service.getLastLoanPhotos('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns an empty result when the item was never loaned', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({ id: 'item-1' });
      prisma.loanItem.findFirst.mockResolvedValue(null);

      const result = await service.getLastLoanPhotos('item-1');

      expect(result).toEqual({ loanId: null, attachments: [] });
      expect(attachments.list).not.toHaveBeenCalled();
    });

    it('returns the checkout/return photos of the most recent loan item', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({ id: 'item-1' });
      prisma.loanItem.findFirst.mockResolvedValue({
        id: 'loan-item-1',
        loanId: 'loan-1',
      });
      attachments.list.mockResolvedValue([
        { id: 'att-1', category: 'checkoutPhoto' },
      ]);

      const result = await service.getLastLoanPhotos('item-1');

      expect(prisma.loanItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inventoryItemId: 'item-1' } }),
      );
      expect(attachments.list).toHaveBeenCalledWith('loanItem', 'loan-item-1');
      expect(result).toEqual({
        loanId: 'loan-1',
        attachments: [{ id: 'att-1', category: 'checkoutPhoto' }],
      });
    });
  });
});
