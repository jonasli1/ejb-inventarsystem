import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { QueryArticleDto } from './dto/query-article.dto';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryArticleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ArticleWhereInput = {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: { category: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [query.sortBy ?? 'name']: query.sortOrder ?? 'asc' },
      }),
      this.prisma.article.count({ where }),
    ]);

    const counts = await this.aggregateCounts(data.map((a) => a.id));

    const enriched = data.map((article) => ({
      ...article,
      stock: counts.get(article.id) ?? { total: 0, available: 0, borrowed: 0 },
    }));

    return paginate(enriched, total, page, pageSize);
  }

  async findOne(id: string) {
    const article = await this.prisma.article.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
    if (!article) throw new NotFoundException('Article not found.');

    const counts = await this.aggregateCounts([id]);
    return {
      ...article,
      stock: counts.get(id) ?? { total: 0, available: 0, borrowed: 0 },
    };
  }

  async getUnits(articleId: string) {
    await this.findOne(articleId);
    return this.prisma.inventoryItem.findMany({
      where: { articleId, deletedAt: null },
      include: {
        location: true,
        room: true,
        ownerOrganization: true,
        ownerUnit: true,
      },
      orderBy: { inventoryNumber: 'asc' },
    });
  }

  async create(dto: CreateArticleDto, actorId?: string) {
    const article = await this.prisma.article.create({
      data: { ...dto, attributes: dto.attributes as Prisma.InputJsonValue },
    });
    await this.audit.log({
      entityType: 'Article',
      entityId: article.id,
      action: 'create',
      summary: `Artikel "${article.name}" angelegt`,
      userId: actorId,
    });
    return article;
  }

  async update(id: string, dto: UpdateArticleDto, actorId?: string) {
    const before = await this.findOne(id);
    const article = await this.prisma.article.update({
      where: { id },
      data: { ...dto, attributes: dto.attributes as Prisma.InputJsonValue },
    });
    await this.audit.log({
      entityType: 'Article',
      entityId: id,
      action: 'update',
      summary: `Artikel "${before.name}" aktualisiert`,
      userId: actorId,
    });
    return article;
  }

  async remove(id: string, actorId?: string) {
    const before = await this.findOne(id);
    const stockCount = await this.prisma.inventoryItem.count({
      where: { articleId: id, deletedAt: null },
    });
    if (stockCount > 0) {
      throw new ConflictException(
        'This article still has inventory items in stock and cannot be deleted. Remove or reassign all units first.',
      );
    }
    await this.prisma.article.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entityType: 'Article',
      entityId: id,
      action: 'delete',
      summary: `Artikel "${before.name}" gelöscht`,
      userId: actorId,
    });
  }

  private async aggregateCounts(articleIds: string[]) {
    const map = new Map<
      string,
      { total: number; available: number; borrowed: number }
    >();
    if (!articleIds.length) return map;

    const grouped = await this.prisma.inventoryItem.groupBy({
      by: ['articleId', 'status'],
      where: { articleId: { in: articleIds }, deletedAt: null },
      _count: { _all: true },
    });

    for (const row of grouped) {
      const entry = map.get(row.articleId) ?? {
        total: 0,
        available: 0,
        borrowed: 0,
      };
      entry.total += row._count._all;
      if (row.status === 'available') entry.available += row._count._all;
      if (row.status === 'borrowed') entry.borrowed += row._count._all;
      map.set(row.articleId, entry);
    }

    return map;
  }
}
