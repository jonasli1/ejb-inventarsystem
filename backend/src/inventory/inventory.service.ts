import { Injectable } from '@nestjs/common';
import {
  InventoryStatus,
  Prisma,
  StockMovementType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { paginate } from '../common/dto/pagination-query.dto';
import {
  decodeCursor,
  paginateByCursor,
} from '../common/dto/cursor-pagination';
import { PERMISSIONS } from '../common/constants/permissions';
import {
  AppBadRequestException,
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { MoveInventoryItemDto } from './dto/move-inventory-item.dto';
import { QueryInventoryItemDto } from './dto/query-inventory-item.dto';
import { AccessoryCandidatesQueryDto } from './dto/accessory-candidates-query.dto';
import { assertValidStatusTransition } from './inventory-status';

// Fields UpdateInventoryItemDto carries besides inventoryNumber and status -
// gated by inventory.update. Kept as an explicit list (rather than inferred
// from the DTO instance) so the permission check is a simple, robust
// presence check, not a value-diffing comparison against Prisma's
// Decimal/Date types. `status` is handled separately below: transitioning
// TO "retired" needs inventory.retire specifically, any other status change
// needs inventory.update, matching "ausmustern" being its own action.
const MANAGE_GATED_UPDATE_KEYS = [
  'articleId',
  'ownerOrganizationId',
  'ownerUnitId',
  'serialNumber',
  'notes',
  'purchasePrice',
  'purchaseDate',
  'nextDguvV3Check',
] as const satisfies readonly (keyof UpdateInventoryItemDto)[];

const INVENTORY_ITEM_INCLUDE = {
  article: true,
  location: true,
  room: true,
  ownerOrganization: true,
  ownerUnit: true,
  parentItem: {
    select: {
      id: true,
      inventoryNumber: true,
      article: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InventoryItemInclude;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
  ) {}

  /** Shared by findAll (list) and ExportService (Excel/PDF) - export must match exactly what the list's current filters/search show. */
  async buildWhere(
    query: Pick<
      QueryInventoryItemDto,
      | 'search'
      | 'articleId'
      | 'categoryId'
      | 'locationId'
      | 'roomId'
      | 'status'
      | 'ownerOrganizationId'
      | 'ownerUnitId'
    >,
  ): Promise<Prisma.InventoryItemWhereInput> {
    // Search contributes its own `OR` clause; combined with any other `AND`
    // conditions since Prisma's `where` supports only one `OR` key per level.
    const andConditions: Prisma.InventoryItemWhereInput[] = [];
    if (query.search) {
      andConditions.push(await this.buildSearchWhere(query.search));
    }

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
    };
    if (andConditions.length) where.AND = andConditions;
    return where;
  }

  async findAll(query: QueryInventoryItemDto) {
    const where = await this.buildWhere(query);

    if (query.grouped) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      return this.findAllGrouped(where, page, pageSize);
    }

    // Flat list: keyset/cursor pagination, not OFFSET - this is the
    // resource expected to grow past 1M rows, where `skip: N` degrades
    // linearly with N (Postgres still has to walk & discard N rows).
    // Ordered by (inventoryNumber, id) - inventoryNumber's column collation
    // is a custom ICU "natural sort" one (see its migration), so this sorts
    // numeric runs within the string by value (Adam-5, Adam-8, Adam-10, ...)
    // rather than lexicographically. inventoryNumber is nullable and
    // Postgres puts NULLs last for ASC by default, so the keyset predicate
    // below mirrors that explicitly: once past a non-null cursor value,
    // NULL rows (sorting after every non-null value) are included too; once
    // the cursor's own value is null, only further null rows (by id) remain.
    const limit = query.limit ?? 50;
    const andConditions: Prisma.InventoryItemWhereInput[] = where.AND
      ? [where.AND].flat()
      : [];
    if (query.cursor) {
      const cursor = decodeCursor<{
        inventoryNumber: string | null;
        id: string;
      }>(query.cursor);
      andConditions.push(
        cursor.inventoryNumber === null
          ? { inventoryNumber: null, id: { gt: cursor.id } }
          : {
              OR: [
                { inventoryNumber: { gt: cursor.inventoryNumber } },
                {
                  inventoryNumber: cursor.inventoryNumber,
                  id: { gt: cursor.id },
                },
                { inventoryNumber: null },
              ],
            },
      );
    }
    if (andConditions.length) where.AND = andConditions;

    const rows = await this.prisma.inventoryItem.findMany({
      where,
      include: INVENTORY_ITEM_INCLUDE,
      orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    return paginateByCursor(rows, limit, (row) => ({
      inventoryNumber: row.inventoryNumber,
      id: row.id,
    }));
  }

  /**
   * Case-insensitive search across the fields relevant to picking an
   * inventory item: its own number/serial, its article's name/manufacturer/
   * category/aliases, and its location context. Reused by the accessory
   * candidate picker. Alias matching needs a raw query since Prisma has no
   * "substring inside any array element" filter.
   */
  private async buildSearchWhere(
    search: string,
  ): Promise<Prisma.InventoryItemWhereInput> {
    const aliasMatches = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM articles a
      WHERE EXISTS (
        SELECT 1 FROM unnest(a.aliases) AS alias WHERE alias ILIKE ${'%' + search + '%'}
      )
    `;

    // Inventory numbers are searched ignoring "0" and spaces (e.g. "EJB831"
    // must find "EJB 0831") - Prisma's `contains` can't strip characters
    // from the stored value, so this needs a raw comparison on both sides,
    // same pattern as the alias match above. Skipped when the search term
    // normalizes to nothing (e.g. searching just "0"), which would
    // otherwise match every item via an empty LIKE '%%'.
    const normalizedSearch = search.replace(/[0 ]/g, '');
    const normalizedNumberMatches = normalizedSearch
      ? await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM inventory_items
          WHERE deleted_at IS NULL
            AND regexp_replace(inventory_number, '[0 ]', '', 'g') ILIKE ${'%' + normalizedSearch + '%'}
        `
      : [];

    const OR: Prisma.InventoryItemWhereInput[] = [
      { inventoryNumber: { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { article: { name: { contains: search, mode: 'insensitive' } } },
      {
        article: { manufacturer: { contains: search, mode: 'insensitive' } },
      },
      {
        article: {
          category: { name: { contains: search, mode: 'insensitive' } },
        },
      },
      {
        ownerOrganization: { name: { contains: search, mode: 'insensitive' } },
      },
      { location: { name: { contains: search, mode: 'insensitive' } } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];

    if (aliasMatches.length) {
      OR.push({ articleId: { in: aliasMatches.map((m) => m.id) } });
    }
    if (normalizedNumberMatches.length) {
      OR.push({ id: { in: normalizedNumberMatches.map((m) => m.id) } });
    }

    return { OR };
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

  /** Cheap total for the dashboard tile - findAll's own list is keyset-paginated with no free COUNT(*). */
  async count(): Promise<{ count: number }> {
    const count = await this.prisma.inventoryItem.count({
      where: { deletedAt: null },
    });
    return { count };
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });
    if (!item) throw new AppNotFoundException('Inventarobjekt nicht gefunden.');
    return item;
  }

  /**
   * Detail view enriched with data inherited (read-only) from the article:
   * its notes and document attachments, each tagged with `origin: 'article'`
   * so the frontend can display them on the object while making clear they
   * live on the article, plus this item's own accessories.
   */
  async findOneWithInherited(id: string) {
    const item = await this.findOne(id);
    const articleDocuments = await this.attachments.list(
      'article',
      item.articleId,
      'document',
    );
    const accessories = await this.prisma.inventoryItem.findMany({
      where: { parentItemId: id, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });

    return {
      ...item,
      article: {
        ...item.article,
        documents: articleDocuments.map((d) => ({
          ...d,
          origin: 'article' as const,
        })),
      },
      accessories,
    };
  }

  async create(dto: CreateInventoryItemDto, userId?: string) {
    const article = await this.prisma.article.findFirst({
      where: { id: dto.articleId, deletedAt: null },
    });
    if (!article) throw new AppNotFoundException('Artikel nicht gefunden.');

    await this.assertInventoryNumberAvailable(dto.inventoryNumber);
    await this.assertRoomBelongsToLocation(dto.roomId, dto.locationId);
    await this.assertUnitBelongsToOrganization(
      dto.ownerUnitId,
      dto.ownerOrganizationId,
    );

    const item = await this.prisma.inventoryItem.create({
      data: {
        ...dto,
        status: dto.status ?? InventoryStatus.available,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
        nextDguvV3Check: dto.nextDguvV3Check
          ? new Date(dto.nextDguvV3Check)
          : null,
      },
      include: INVENTORY_ITEM_INCLUDE,
    });

    await this.prisma.stockMovement.create({
      data: {
        inventoryItemId: item.id,
        type: StockMovementType.in,
        toRoomId: item.roomId,
        newStatus: item.status,
        userId,
        note: 'Zugang (Ersterfassung)',
      },
    });

    return item;
  }

  async update(
    id: string,
    dto: UpdateInventoryItemDto,
    user: AuthenticatedUser,
  ) {
    const existing = await this.findOne(id);
    const userId = user.id;

    if (
      dto.inventoryNumber !== undefined &&
      !user.permissions.includes(PERMISSIONS.INVENTORY_CHANGE_INVENTORY_NUMBER)
    ) {
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, die Inventarnummer zu ändern.',
        'MISSING_PERMISSION',
      );
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      const isRetiring = dto.status === InventoryStatus.retired;
      const required = isRetiring
        ? PERMISSIONS.INVENTORY_RETIRE
        : PERMISSIONS.INVENTORY_UPDATE;
      if (!user.permissions.includes(required)) {
        throw new AppForbiddenException(
          isRetiring
            ? 'Sie haben keine Berechtigung, Inventarobjekte auszumustern.'
            : 'Sie haben keine Berechtigung, Inventarobjekte zu bearbeiten.',
          'MISSING_PERMISSION',
        );
      }
    }
    if (
      MANAGE_GATED_UPDATE_KEYS.some((key) => dto[key] !== undefined) &&
      !user.permissions.includes(PERMISSIONS.INVENTORY_UPDATE)
    ) {
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, Inventarobjekte zu bearbeiten.',
        'MISSING_PERMISSION',
      );
    }

    if (dto.inventoryNumber !== undefined) {
      await this.assertInventoryNumberAvailable(dto.inventoryNumber, id);
    }

    if (dto.ownerUnitId || dto.ownerOrganizationId) {
      await this.assertUnitBelongsToOrganization(
        dto.ownerUnitId ?? existing.ownerUnitId,
        dto.ownerOrganizationId ?? existing.ownerOrganizationId,
      );
    }

    const movements: Prisma.StockMovementCreateManyInput[] = [];
    if (dto.status && dto.status !== existing.status) {
      assertValidStatusTransition(existing.status, dto.status);
      movements.push({
        inventoryItemId: id,
        type: StockMovementType.status_change,
        oldStatus: existing.status,
        newStatus: dto.status,
        userId,
      });
    }

    const [item] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: {
          ...dto,
          purchaseDate:
            dto.purchaseDate !== undefined
              ? dto.purchaseDate
                ? new Date(dto.purchaseDate)
                : null
              : undefined,
          nextDguvV3Check:
            dto.nextDguvV3Check !== undefined
              ? dto.nextDguvV3Check
                ? new Date(dto.nextDguvV3Check)
                : null
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
    if (existing.status === InventoryStatus.borrowed) {
      throw new AppBadRequestException(
        'Ein ausgeliehenes Inventarobjekt kann nicht ausgemustert werden, solange es nicht über die Ausleihe zurückgegeben wurde.',
        'ITEM_CURRENTLY_BORROWED',
      );
    }
    await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'retired', parentItemId: null },
      }),
      // Retiring a parent releases its accessories rather than deleting them.
      this.prisma.inventoryItem.updateMany({
        where: { parentItemId: id },
        data: { parentItemId: null },
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
        loanItem: { select: { id: true, loanId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async move(id: string, dto: MoveInventoryItemDto, userId?: string) {
    const item = await this.findOne(id);
    const toRoom = await this.prisma.room.findFirst({
      where: { id: dto.toRoomId, deletedAt: null },
    });
    if (!toRoom) throw new AppNotFoundException('Zielraum nicht gefunden.');

    if (toRoom.id === item.roomId) {
      throw new AppBadRequestException(
        'Das Objekt befindet sich bereits in diesem Raum.',
        'ALREADY_IN_TARGET_ROOM',
      );
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

  // -------------------------------------------------------------------------
  // Accessories (self-relation, depth 1, no cycles)
  // -------------------------------------------------------------------------

  async getAccessoryCandidates(
    itemId: string,
    query: AccessoryCandidatesQueryDto,
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true, parentItemId: true },
    });
    if (!item) throw new AppNotFoundException('Inventarobjekt nicht gefunden.');

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      id: { not: itemId },
      ...(query.search ? await this.buildSearchWhere(query.search) : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        include: {
          ...INVENTORY_ITEM_INCLUDE,
          accessories: { where: { deletedAt: null }, select: { id: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { inventoryNumber: 'asc' },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    const parentIsItselfAccessory = item.parentItemId !== null;
    const candidates = data.map((candidate) => ({
      ...candidate,
      ...this.evaluateAccessoryEligibility(candidate, parentIsItselfAccessory),
    }));

    return paginate(candidates, total, page, pageSize);
  }

  private evaluateAccessoryEligibility(
    candidate: {
      parentItemId: string | null;
      status: InventoryStatus;
      accessories: { id: string }[];
    },
    parentIsItselfAccessory: boolean,
  ): { eligible: boolean; reason?: string } {
    if (parentIsItselfAccessory) {
      return {
        eligible: false,
        reason:
          'Dieses Objekt ist selbst Zubehör und kann daher kein weiteres Zubehör erhalten.',
      };
    }
    if (candidate.parentItemId) {
      return {
        eligible: false,
        reason: 'Dieses Objekt ist bereits Zubehör eines anderen Objekts.',
      };
    }
    if (candidate.accessories.length > 0) {
      return {
        eligible: false,
        reason:
          'Dieses Objekt hat selbst Zubehör und kann daher nicht selbst Zubehör werden.',
      };
    }
    if (candidate.status === InventoryStatus.retired) {
      return { eligible: false, reason: 'Dieses Objekt ist ausgemustert.' };
    }
    return { eligible: true };
  }

  async assignAccessory(itemId: string, accessoryItemId: string) {
    if (itemId === accessoryItemId) {
      throw new AppBadRequestException(
        'Ein Objekt kann nicht sein eigenes Zubehör sein.',
        'ACCESSORY_SELF_REFERENCE',
      );
    }

    const parent = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true, parentItemId: true },
    });
    if (!parent)
      throw new AppNotFoundException('Inventarobjekt nicht gefunden.');

    const candidate = await this.prisma.inventoryItem.findFirst({
      where: { id: accessoryItemId, deletedAt: null },
      include: {
        accessories: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!candidate) {
      throw new AppNotFoundException(
        'Das ausgewählte Zubehör-Objekt wurde nicht gefunden.',
      );
    }

    const eligibility = this.evaluateAccessoryEligibility(
      candidate,
      parent.parentItemId !== null,
    );
    if (!eligibility.eligible) {
      throw new AppBadRequestException(
        eligibility.reason!,
        'ACCESSORY_NOT_ELIGIBLE',
      );
    }

    return this.prisma.inventoryItem.update({
      where: { id: accessoryItemId },
      data: { parentItemId: itemId },
      include: INVENTORY_ITEM_INCLUDE,
    });
  }

  async removeAccessory(itemId: string, accessoryItemId: string) {
    const candidate = await this.prisma.inventoryItem.findFirst({
      where: { id: accessoryItemId, deletedAt: null, parentItemId: itemId },
    });
    if (!candidate) {
      throw new AppNotFoundException(
        'Dieses Objekt ist kein Zubehör des angegebenen Inventarobjekts.',
      );
    }
    return this.prisma.inventoryItem.update({
      where: { id: accessoryItemId },
      data: { parentItemId: null },
      include: INVENTORY_ITEM_INCLUDE,
    });
  }

  // -------------------------------------------------------------------------

  private async assertInventoryNumberAvailable(
    inventoryNumber: string | undefined,
    excludeId?: string,
  ) {
    if (!inventoryNumber) return;
    const conflict = await this.prisma.inventoryItem.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        deletedAt: null,
        status: { not: InventoryStatus.retired },
        inventoryNumber: { equals: inventoryNumber, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new AppConflictException(
        `Die Inventarnummer "${inventoryNumber}" wird bereits von einem aktiven Inventarobjekt verwendet.`,
        'DUPLICATE_INVENTORY_NUMBER',
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
    if (!room) throw new AppNotFoundException('Raum nicht gefunden.');
    if (room.locationId !== locationId) {
      throw new AppBadRequestException(
        'Der ausgewählte Raum gehört nicht zum ausgewählten Standort.',
        'ROOM_LOCATION_MISMATCH',
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
    if (!unit)
      throw new AppNotFoundException('Organisationsbereich nicht gefunden.');
    if (unit.organizationId !== organizationId) {
      throw new AppBadRequestException(
        'Der ausgewählte Organisationsbereich gehört nicht zur ausgewählten Organisation.',
        'UNIT_ORGANIZATION_MISMATCH',
      );
    }
  }
}
