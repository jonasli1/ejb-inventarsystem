import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../common/dto/cursor-pagination';
import { AppForbiddenException } from '../common/exceptions/app.exception';
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
  login: 'Angemeldet',
  login_failed: 'Anmeldung fehlgeschlagen',
  logout: 'Abgemeldet',
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
    inventoryNumber: string | null;
    article: { id: string; name: string };
  } | null;
  user: { id: string; displayName: string } | null;
}

interface SourceCursor {
  createdAt: string;
  id: string;
}

interface ActivityCursor {
  movement: SourceCursor | null;
  audit: SourceCursor | null;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merges two independently-ordered sources (StockMovement, AuditLog) into
   * one feed via keyset pagination - not an ever-growing "fetch page*pageSize
   * from each source, merge, re-slice" (that degraded linearly with page
   * depth). Each source tracks its own cursor across pages: a page fetches
   * up to `limit` *new* rows from each source (i.e. strictly past that
   * source's own last-consumed row), merge-sorts the combined candidates,
   * and only advances a source's cursor by however many of its rows were
   * actually consumed into this page - so a source with leftover unconsumed
   * rows is picked up correctly on the next page instead of being skipped.
   */
  async findAll(query: QueryActivityDto, canViewLoans: boolean) {
    if (query.loanId && !canViewLoans) {
      throw new AppForbiddenException(
        'Fehlende Berechtigung(en): eine von loans.read, loans.manage.',
        'MISSING_PERMISSION',
      );
    }

    const limit = query.limit ?? 20;
    const sortOrder = query.sortOrder ?? 'desc';
    const op = sortOrder === 'asc' ? 'gt' : 'lt';

    // A `loanId` filter can only be satisfied by audit entries (movements
    // don't carry a loan reference); an `inventoryItemId`/`type` filter can
    // only be satisfied by movements (no per-item audit entries exist).
    const includeAudit = !query.inventoryItemId && !query.type;
    const includeMovements = !query.loanId;

    const cursor: ActivityCursor = query.cursor
      ? decodeCursor<ActivityCursor>(query.cursor)
      : { movement: null, audit: null };

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
      ...(cursor.movement ? cursorWhere(cursor.movement, op) : {}),
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
      ...(cursor.audit ? cursorWhere(cursor.audit, op) : {}),
    };

    const [movements, auditEntries] = await Promise.all([
      includeMovements
        ? this.prisma.stockMovement.findMany({
            where: movementWhere,
            include: MOVEMENT_INCLUDE,
            orderBy: [{ createdAt: sortOrder }, { id: sortOrder }],
            take: limit,
          })
        : Promise.resolve([]),
      includeAudit
        ? this.prisma.auditLog.findMany({
            where: auditWhere,
            include: { user: { select: { id: true, displayName: true } } },
            orderBy: [{ createdAt: sortOrder }, { id: sortOrder }],
            take: limit,
          })
        : Promise.resolve([]),
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

    const sortFn = (a: ActivityFeedEntry, b: ActivityFeedEntry) => {
      const diff = a.createdAt.getTime() - b.createdAt.getTime();
      const byTime = sortOrder === 'asc' ? diff : -diff;
      if (byTime !== 0) return byTime;
      const byId = a.id.localeCompare(b.id);
      return sortOrder === 'asc' ? byId : -byId;
    };

    const merged = [...movementEntries, ...auditFeedEntries]
      .sort(sortFn)
      .slice(0, limit);

    const consumedMovements = merged.filter((e) => e.source === 'movement');
    const consumedAudits = merged.filter((e) => e.source === 'audit');

    // A source only needs its cursor advanced if we actually consumed rows
    // from it - otherwise every one of its fetched-but-unconsumed rows
    // stays a candidate for the next page, so its cursor (and therefore its
    // next fetch) must stay exactly where it was.
    const nextMovementCursor = consumedMovements.length
      ? sourceCursor(consumedMovements[consumedMovements.length - 1])
      : cursor.movement;
    const nextAuditCursor = consumedAudits.length
      ? sourceCursor(consumedAudits[consumedAudits.length - 1])
      : cursor.audit;

    // Both sources exhausted (fetched fewer than `limit`, i.e. nothing left
    // past this fetch) means there's nothing more overall.
    const movementExhausted = !includeMovements || movements.length < limit;
    const auditExhausted = !includeAudit || auditEntries.length < limit;
    const hasMore = !(movementExhausted && auditExhausted) && merged.length > 0;

    return {
      data: merged,
      nextCursor: hasMore
        ? encodeCursor({ movement: nextMovementCursor, audit: nextAuditCursor })
        : null,
    };
  }
}

function cursorWhere(
  c: SourceCursor,
  op: 'gt' | 'lt',
): { OR: Record<string, unknown>[] } {
  return {
    OR: [
      { createdAt: { [op]: new Date(c.createdAt) } },
      { createdAt: new Date(c.createdAt), id: { [op]: c.id } },
    ],
  };
}

function sourceCursor(entry: ActivityFeedEntry): SourceCursor {
  return { createdAt: entry.createdAt.toISOString(), id: entry.id };
}
