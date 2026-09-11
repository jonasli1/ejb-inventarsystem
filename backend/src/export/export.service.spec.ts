import { ExportService } from './export.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ArticlesService } from '../articles/articles.service';

const mockItem = {
  id: 'item-1',
  inventoryNumber: 'Adam-5',
  status: 'available',
  article: { name: 'Testartikel' },
  location: { name: 'Testort' },
  room: { name: 'Testraum' },
  ownerOrganization: { name: 'Org' },
  ownerUnit: { name: 'Einheit' },
  purchasePrice: null,
  purchaseDate: null,
  serialNumber: null,
};

const mockArticle = {
  id: 'article-1',
  name: 'Testartikel',
  category: { name: 'Kategorie' },
};

describe('ExportService', () => {
  let service: ExportService;
  let prisma: {
    inventoryItem: { findMany: jest.Mock };
    article: { findMany: jest.Mock };
  };
  let inventoryService: { buildWhere: jest.Mock };
  let articlesService: { buildWhere: jest.Mock };

  beforeEach(() => {
    prisma = {
      inventoryItem: { findMany: jest.fn().mockResolvedValue([mockItem]) },
      article: { findMany: jest.fn().mockResolvedValue([mockArticle]) },
    };
    inventoryService = {
      buildWhere: jest
        .fn()
        .mockResolvedValue({ deletedAt: null, status: 'available' }),
    };
    articlesService = {
      buildWhere: jest
        .fn()
        .mockResolvedValue({ deletedAt: null, categoryId: 'cat-1' }),
    };
    service = new ExportService(
      prisma as unknown as PrismaService,
      inventoryService as unknown as InventoryService,
      articlesService as unknown as ArticlesService,
    );
  });

  describe('exportInventory', () => {
    it("builds its where clause from InventoryService.buildWhere, applying exactly the list's current filters", async () => {
      const query = { status: 'available' as const, search: 'kabel' };
      await service.exportInventory(query, 'xlsx');

      expect(inventoryService.buildWhere).toHaveBeenCalledWith(query);
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, status: 'available' },
          orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('produces a single flat workbook/filename regardless of any grouping', async () => {
      const file = await service.exportInventory({}, 'xlsx');
      expect(file.filename).toBe('Inventar.xlsx');
    });
  });

  describe('exportArticles', () => {
    it("builds its where clause from ArticlesService.buildWhere, applying exactly the list's current filters", async () => {
      const query = { categoryId: 'cat-1' };
      await service.exportArticles(query, 'xlsx');

      expect(articlesService.buildWhere).toHaveBeenCalledWith(query);
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, categoryId: 'cat-1' },
        }),
      );
    });

    it('combines buildWhere filters with an explicit articleIds selection when both are given', async () => {
      const query = {
        categoryId: 'cat-1',
        articleIds: ['article-1', 'article-2'],
      };
      await service.exportArticles(query, 'xlsx');

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            categoryId: 'cat-1',
            id: { in: ['article-1', 'article-2'] },
          },
        }),
      );
    });
  });
});
