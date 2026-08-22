import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArticleType,
  AttachmentEntityType,
  Prisma,
  StockMovementType,
} from '@prisma/client';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/dto/pagination-query.dto';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { MoveInventoryItemDto } from './dto/move-inventory-item.dto';
import { QueryInventoryItemDto } from './dto/query-inventory-item.dto';

const INVENTORY_ITEM_INCLUDE = {
  article: true,
  location: true,
  room: true,
  ownerOrganization: true,
  ownerUnit: true,
} satisfies Prisma.InventoryItemInclude;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
  ) {}

  async findAll(query: QueryInventoryItemDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      ...(query.articleId ? { articleId: query.articleId } : {}),
      ...(query.categoryId
        ? { article: { categoryId: query.categoryId } }
        : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerOrganizationId
        ? { ownerOrganizationId: query.ownerOrganizationId }
        : {}),
      ...(query.ownerUnitId ? { ownerUnitId: query.ownerUnitId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                inventoryNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { serialNumber: { contains: query.search, mode: 'insensitive' } },
              {
                article: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                article: {
                  manufacturer: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                article: {
                  category: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                ownerOrganization: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                location: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    if (query.grouped) {
      return this.findAllGrouped(where, page, pageSize);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        include: INVENTORY_ITEM_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          [query.sortBy ?? 'inventoryNumber']: query.sortOrder ?? 'asc',
        },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  private async findAllGrouped(
    where: Prisma.InventoryItemWhereInput,
    page: number,
    pageSize: number,
  ) {
    const distinctArticles = await this.prisma.inventoryItem.findMany({
      where,
      select: { articleId: true },
      distinct: ['articleId'],
      orderBy: { articleId: 'asc' },
    });

    const total = distinctArticles.length;
    const pageArticleIds = distinctArticles
      .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
      .map((a) => a.articleId);

    if (!pageArticleIds.length) {
      return paginate([], total, page, pageSize);
    }

    const items = await this.prisma.inventoryItem.findMany({
      where: { ...where, articleId: { in: pageArticleIds } },
      include: INVENTORY_ITEM_INCLUDE,
      orderBy: { inventoryNumber: 'asc' },
    });

    const grouped = pageArticleIds.map((articleId) => {
      const units = items.filter((i) => i.articleId === articleId);
      return {
        article: units[0]?.article,
        stock: {
          total: units.length,
          available: units.filter((u) => u.status === 'available').length,
          borrowed: units.filter((u) => u.status === 'borrowed').length,
        },
        units,
      };
    });

    return paginate(grouped, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });
    if (!item) throw new NotFoundException('Inventory item not found.');
    return item;
  }

  /** Checkout/return photos attached to this item's most recent loan, if any. */
  async getLastLoanPhotos(id: string) {
    await this.findOne(id);

    const lastLoanItem = await this.prisma.loanItem.findFirst({
      where: { inventoryItemId: id },
      orderBy: { loan: { checkoutDate: 'desc' } },
      select: { id: true, loanId: true },
    });
    if (!lastLoanItem) return { loanId: null, attachments: [] };

    const attachments = await this.attachments.list(
      AttachmentEntityType.loanItem,
      lastLoanItem.id,
    );
    return { loanId: lastLoanItem.loanId, attachments };
  }

  async create(dto: CreateInventoryItemDto, userId?: string) {
    const article = await this.prisma.article.findFirst({
      where: { id: dto.articleId, deletedAt: null },
    });
    if (!article) throw new NotFoundException('Article not found.');

    this.assertConditionPercentAllowed(article.type, dto.conditionPercent);
    await this.assertRoomBelongsToLocation(dto.roomId, dto.locationId);
    await this.assertUnitBelongsToOrganization(
      dto.ownerUnitId,
      dto.ownerOrganizationId,
    );

    const inventoryNumber =
      dto.inventoryNumber ?? this.generateInventoryNumber();

    const item = await this.prisma.inventoryItem.create({
      data: {
        ...dto,
        inventoryNumber,
        purchaseDate: dto.purchaseDate
          ? new Date(dto.purchaseDate)
          : new Date(),
      },
      include: INVENTORY_ITEM_INCLUDE,
    });

    await this.prisma.stockMovement.create({
      data: {
        inventoryItemId: item.id,
        type: StockMovementType.in,
        toRoomId: item.roomId,
        newStatus: item.status,
        newCondition: item.conditionPercent,
        userId,
        note: 'Initial stock intake',
      },
    });

    return item;
  }

  async update(id: string, dto: UpdateInventoryItemDto, userId?: string) {
    const existing = await this.findOne(id);

    const articleType = dto.articleId
      ? (
          await this.prisma.article.findFirstOrThrow({
            where: { id: dto.articleId },
          })
        ).type
      : existing.article.type;
    this.assertConditionPercentAllowed(
      articleType,
      dto.conditionPercent ?? existing.conditionPercent ?? undefined,
    );

    if (dto.ownerUnitId || dto.ownerOrganizationId) {
      await this.assertUnitBelongsToOrganization(
        dto.ownerUnitId ?? existing.ownerUnitId,
        dto.ownerOrganizationId ?? existing.ownerOrganizationId,
      );
    }

    const movements: Prisma.StockMovementCreateManyInput[] = [];
    if (dto.status && dto.status !== existing.status) {
      movements.push({
        inventoryItemId: id,
        type: StockMovementType.status_change,
        oldStatus: existing.status,
        newStatus: dto.status,
        userId,
      });
    }
    if (
      dto.conditionPercent !== undefined &&
      dto.conditionPercent !== existing.conditionPercent
    ) {
      movements.push({
        inventoryItemId: id,
        type: StockMovementType.condition_change,
        oldCondition: existing.conditionPercent,
        newCondition: dto.conditionPercent,
        userId,
      });
    }

    const [item] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: {
          ...dto,
          purchaseDate: dto.purchaseDate
            ? new Date(dto.purchaseDate)
            : undefined,
        },
        include: INVENTORY_ITEM_INCLUDE,
      }),
      ...movements.map((m) => this.prisma.stockMovement.create({ data: m })),
    ]);

    return item;
  }

  async remove(id: string, userId?: string) {
    const existing = await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'retired' },
      }),
      this.prisma.stockMovement.create({
        data: {
          inventoryItemId: id,
          type: StockMovementType.status_change,
          oldStatus: existing.status,
          newStatus: 'retired',
          userId,
          note: 'Inventarobjekt gelöscht/ausgemustert',
        },
      }),
    ]);
  }

  async getMovements(id: string) {
    await this.findOne(id);
    return this.prisma.stockMovement.findMany({
      where: { inventoryItemId: id },
      include: {
        fromRoom: true,
        toRoom: true,
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async move(id: string, dto: MoveInventoryItemDto, userId?: string) {
    const item = await this.findOne(id);
    const toRoom = await this.prisma.room.findFirst({
      where: { id: dto.toRoomId, deletedAt: null },
    });
    if (!toRoom) throw new NotFoundException('Target room not found.');

    if (toRoom.id === item.roomId) {
      throw new BadRequestException('Item is already in the target room.');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: { roomId: toRoom.id, locationId: toRoom.locationId },
        include: INVENTORY_ITEM_INCLUDE,
      }),
      this.prisma.stockMovement.create({
        data: {
          inventoryItemId: id,
          type: StockMovementType.move,
          fromRoomId: item.roomId,
          toRoomId: toRoom.id,
          userId,
          note: dto.note,
        },
      }),
    ]);

    return updated;
  }

  private assertConditionPercentAllowed(
    type: ArticleType,
    conditionPercent?: number | null,
  ) {
    if (
      conditionPercent !== undefined &&
      conditionPercent !== null &&
      type !== ArticleType.CONSUMABLE
    ) {
      throw new BadRequestException(
        'conditionPercent is only allowed for CONSUMABLE articles.',
      );
    }
  }

  private async assertRoomBelongsToLocation(
    roomId: string,
    locationId: string,
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, deletedAt: null },
    });
    if (!room) throw new NotFoundException('Room not found.');
    if (room.locationId !== locationId) {
      throw new BadRequestException(
        'The selected room does not belong to the selected location.',
      );
    }
  }

  private async assertUnitBelongsToOrganization(
    unitId: string,
    organizationId: string,
  ) {
    const unit = await this.prisma.organizationUnit.findFirst({
      where: { id: unitId, deletedAt: null },
    });
    if (!unit) throw new NotFoundException('Organization unit not found.');
    if (unit.organizationId !== organizationId) {
      throw new BadRequestException(
        'The selected organization unit does not belong to the selected organization.',
      );
    }
  }

  private generateInventoryNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `INV-${timestamp}-${random}`;
  }
}
