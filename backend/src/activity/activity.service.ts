import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/dto/pagination-query.dto';
import {
  describeMovement,
  MOVEMENT_TYPE_LABEL,
} from '../common/constants/labels';
import { QueryActivityDto } from './dto/query-activity.dto';

const MOVEMENT_INCLUDE = {
  inventoryItem: {
    select: {
      id: true,
      inventoryNumber: true,
      article: { select: { id: true, name: true } },
    },
  },
  fromRoom: { select: { id: true, name: true } },
  toRoom: { select: { id: true, name: true } },
  user: { select: { id: true, displayName: true } },
} satisfies Prisma.StockMovementInclude;

const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: 'Erstellt',
  update: 'Aktualisiert',
  delete: 'Gelöscht',
};

export interface ActivityFeedEntry {
  id: string;
  source: 'movement' | 'audit';
  createdAt: Date;
  typeLabel: string;
  entityType: string;
  entityId: string;
  description: string;
  inventoryItem: {
    id: string;
    inventoryNumber: string;
    article: { id: string; name: string };
  } | null;
  user: { id: string; displayName: string } | null;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryActivityDto, canViewLoans: boolean) {
    if (query.loanId && !canViewLoans) {
      throw new ForbiddenException(
        'Missing required permission(s): one of loans.view, loans.manage',
      );
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortOrder = query.sortOrder ?? 'desc';

    // A `loanId` filter can only be satisfied by audit entries (movements
    // don't carry a loan reference); an `inventoryItemId`/`type` filter can
    // only be satisfied by movements (no per-item audit entries exist).
    const includeAudit = !query.inventoryItemId && !query.type;
    const includeMovements = !query.loanId;

    const movementWhere: Prisma.StockMovementWhereInput = {
      ...(query.inventoryItemId
        ? { inventoryItemId: query.inventoryItemId }
        : {}),
      ...(query.articleId
        ? { inventoryItem: { articleId: query.articleId } }
        : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const auditWhere: Prisma.AuditLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.articleId
        ? { entityType: 'Article', entityId: query.articleId }
        : {}),
      ...(query.loanId
        ? { entityType: 'Loan', entityId: query.loanId }
        : !canViewLoans
          ? { entityType: { not: 'Loan' } }
          : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    // Over-fetch each source up to the end of the requested page, merge, and
    // re-slice — simple and correct at the scale this system runs at.
    const fetchLimit = page * pageSize;

    const [movements, movementCount, auditEntries, auditCount] =
      await Promise.all([
        includeMovements
          ? this.prisma.stockMovement.findMany({
              where: movementWhere,
              include: MOVEMENT_INCLUDE,
              orderBy: { createdAt: sortOrder },
              take: fetchLimit,
            })
          : Promise.resolve([]),
        includeMovements
          ? this.prisma.stockMovement.count({ where: movementWhere })
          : Promise.resolve(0),
        includeAudit
          ? this.prisma.auditLog.findMany({
              where: auditWhere,
              include: { user: { select: { id: true, displayName: true } } },
              orderBy: { createdAt: sortOrder },
              take: fetchLimit,
            })
          : Promise.resolve([]),
        includeAudit
          ? this.prisma.auditLog.count({ where: auditWhere })
          : Promise.resolve(0),
      ]);

    const movementEntries: ActivityFeedEntry[] = movements.map((m) => ({
      id: m.id,
      source: 'movement' as const,
      createdAt: m.createdAt,
      typeLabel: MOVEMENT_TYPE_LABEL[m.type] ?? m.type,
      entityType: 'InventoryItem',
      entityId: m.inventoryItemId,
      description:
        [describeMovement(m), m.note].filter(Boolean).join(' · ') || '–',
      inventoryItem: m.inventoryItem,
      user: m.user,
    }));

    const auditFeedEntries: ActivityFeedEntry[] = auditEntries.map((a) => ({
      id: a.id,
      source: 'audit' as const,
      createdAt: a.createdAt,
      typeLabel: AUDIT_ACTION_LABEL[a.action] ?? a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      description: a.summary,
      inventoryItem: null,
      user: a.user,
    }));

    const merged = [...movementEntries, ...auditFeedEntries].sort((a, b) =>
      sortOrder === 'asc'
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const data = merged.slice((page - 1) * pageSize, page * pageSize);
    const total = movementCount + auditCount;

    return paginate(data, total, page, pageSize);
  }
}
