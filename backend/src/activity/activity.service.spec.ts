import { ForbiddenException } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityService', () => {
  let service: ActivityService;
  let prisma: {
    stockMovement: { findMany: jest.Mock; count: jest.Mock };
    auditLog: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new ActivityService(prisma as unknown as PrismaService);
  });

  it('filters movements by articleId via the related inventory item', async () => {
    await service.findAll(
      { articleId: 'article-1', page: 1, pageSize: 20 },
      true,
    );
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inventoryItem: { articleId: 'article-1' } },
      }),
    );
  });

  it('filters audit entries by articleId as an Article-scoped lookup', async () => {
    await service.findAll(
      { articleId: 'article-1', page: 1, pageSize: 20 },
      true,
    );
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'Article', entityId: 'article-1' },
      }),
    );
  });

  it('filters by a from/to date range on createdAt for both sources', async () => {
    await service.findAll(
      {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
        page: 1,
        pageSize: 20,
      },
      true,
    );
    const expectedRange = {
      createdAt: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-01-31T00:00:00.000Z'),
      },
    };
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedRange }),
    );
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedRange }),
    );
  });

  it('sorts by most recent first by default', async () => {
    await service.findAll({ page: 1, pageSize: 20 }, true);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('only queries audit entries (not movements) when filtering by loanId', async () => {
    await service.findAll({ loanId: 'loan-1', page: 1, pageSize: 20 }, true);
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'Loan', entityId: 'loan-1' },
      }),
    );
  });

  it('only queries movements (not audit entries) when filtering by inventoryItemId', async () => {
    await service.findAll(
      { inventoryItemId: 'item-1', page: 1, pageSize: 20 },
      true,
    );
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { inventoryItemId: 'item-1' } }),
    );
  });

  it('refuses a loanId filter for a user without loans.view/loans.manage', async () => {
    await expect(
      service.findAll({ loanId: 'loan-1', page: 1, pageSize: 20 }, false),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('excludes Loan-entity audit entries from the general feed for a user without loan permissions', async () => {
    await service.findAll({ page: 1, pageSize: 20 }, false);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: { not: 'Loan' } },
      }),
    );
  });

  it('merges and sorts entries from both sources by recency', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 'movement-1',
        type: 'move',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        note: null,
        oldStatus: null,
        newStatus: null,
        oldCondition: null,
        newCondition: null,
        fromRoom: null,
        toRoom: null,
        inventoryItemId: 'item-1',
        inventoryItem: {
          id: 'item-1',
          inventoryNumber: 'INV-1',
          article: { id: 'article-1', name: 'Kabel' },
        },
        user: null,
      },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        entityType: 'Article',
        entityId: 'article-1',
        action: 'create',
        summary: 'Artikel "Kabel" angelegt',
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
        user: null,
      },
    ]);

    const result = await service.findAll({ page: 1, pageSize: 20 }, true);
    expect(result.data.map((e) => e.id)).toEqual(['audit-1', 'movement-1']);
    expect(result.meta.total).toBe(0); // count mocks default to 0 in this test
  });
});
