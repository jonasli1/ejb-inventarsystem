import { ForbiddenException } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityService', () => {
  let service: ActivityService;
  let prisma: {
    stockMovement: { findMany: jest.Mock };
    auditLog: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ActivityService(prisma as unknown as PrismaService);
  });

  it('filters movements by articleId via the related inventory item', async () => {
    await service.findAll({ articleId: 'article-1', limit: 20 }, true);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inventoryItem: { articleId: 'article-1' } },
      }),
    );
  });

  it('filters audit entries by articleId as an Article-scoped lookup', async () => {
    await service.findAll({ articleId: 'article-1', limit: 20 }, true);
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
        limit: 20,
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

  it('sorts by most recent first by default, tie-broken by id', async () => {
    await service.findAll({ limit: 20 }, true);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('only queries audit entries (not movements) when filtering by loanId', async () => {
    await service.findAll({ loanId: 'loan-1', limit: 20 }, true);
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'Loan', entityId: 'loan-1' },
      }),
    );
  });

  it('only queries movements (not audit entries) when filtering by inventoryItemId', async () => {
    await service.findAll({ inventoryItemId: 'item-1', limit: 20 }, true);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { inventoryItemId: 'item-1' } }),
    );
  });

  it('refuses a loanId filter for a user without loans.view/loans.manage', async () => {
    await expect(
      service.findAll({ loanId: 'loan-1', limit: 20 }, false),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('excludes Loan-entity audit entries from the general feed for a user without loan permissions', async () => {
    await service.findAll({ limit: 20 }, false);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: { not: 'Loan' } },
      }),
    );
  });

  it('merges and sorts entries from both sources by recency, with no nextCursor once both sources are exhausted', async () => {
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

    const result = await service.findAll({ limit: 20 }, true);
    expect(result.data.map((e) => e.id)).toEqual(['audit-1', 'movement-1']);
    // Both sources returned fewer rows than `limit` -> both exhausted.
    expect(result.nextCursor).toBeNull();
  });

  it('provides a nextCursor pointing only at the consumed source(s) when a source still has unconsumed candidates', async () => {
    const movements = Array.from({ length: 2 }, (_, i) => ({
      id: `movement-${i}`,
      type: 'move',
      createdAt: new Date(2026, 0, 10 - i),
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
    }));
    // 2 audit rows returned (== limit), all older than both movements ->
    // neither gets consumed into this page, so the source is NOT exhausted
    // and its cursor must stay frozen for the next page to pick them up.
    const auditEntries = Array.from({ length: 2 }, (_, i) => ({
      id: `audit-${i}`,
      entityType: 'Article',
      entityId: 'article-1',
      action: 'update',
      summary: `Update ${i}`,
      createdAt: new Date(2026, 0, 1 - i),
      user: null,
    }));
    prisma.stockMovement.findMany.mockResolvedValue(movements);
    prisma.auditLog.findMany.mockResolvedValue(auditEntries);

    const result = await service.findAll({ limit: 2 }, true);
    expect(result.data.map((e) => e.id)).toEqual(['movement-0', 'movement-1']);
    expect(result.nextCursor).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(result.nextCursor!, 'base64url').toString('utf8'),
    ) as { movement: { id: string } | null; audit: { id: string } | null };
    expect(decoded.movement?.id).toBe('movement-1');
    // Unconsumed this round -> cursor stays null (unchanged from the start).
    expect(decoded.audit).toBeNull();
  });
});
