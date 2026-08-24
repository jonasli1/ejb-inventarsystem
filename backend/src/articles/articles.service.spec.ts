import { ConflictException, NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: {
    article: {
      findFirst: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    inventoryItem: { groupBy: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      article: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryItem: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new ArticlesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('findAll', () => {
    it('builds a full-text OR filter across name, manufacturer, description and category name', async () => {
      await service.findAll({ search: 'Kabel' });
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'Kabel', mode: 'insensitive' } },
              { manufacturer: { contains: 'Kabel', mode: 'insensitive' } },
              { description: { contains: 'Kabel', mode: 'insensitive' } },
              {
                category: { name: { contains: 'Kabel', mode: 'insensitive' } },
              },
            ],
          }),
        }),
      );
    });

    it('omits the OR filter entirely when no search term is given', async () => {
      await service.findAll({ type: 'UNIQUE' });
      const call = prisma.article.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeUndefined();
    });

    it('combines search with type/category filters', async () => {
      await service.findAll({
        search: 'Akku',
        type: 'CONSUMABLE',
        categoryId: 'cat-1',
      });
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'CONSUMABLE',
            categoryId: 'cat-1',
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('throws when the article no longer exists', async () => {
      prisma.article.findFirst.mockResolvedValue(null);
      await expect(service.remove('article-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to delete an article that still has inventory items in stock', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.inventoryItem.count.mockResolvedValue(2);
      await expect(service.remove('article-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.article.update).not.toHaveBeenCalled();
    });

    it('deletes an article with no inventory items left', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.inventoryItem.count.mockResolvedValue(0);
      await service.remove('article-1');
      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
