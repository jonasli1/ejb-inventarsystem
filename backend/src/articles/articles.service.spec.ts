import { ConflictException, NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: {
    article: { findFirst: jest.Mock; update: jest.Mock };
    inventoryItem: { groupBy: jest.Mock; count: jest.Mock };
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      article: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryItem: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new ArticlesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
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
