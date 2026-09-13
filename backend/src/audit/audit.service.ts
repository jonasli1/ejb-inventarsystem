import { Injectable } from '@nestjs/common';
import { AuditAction, AuditCategory, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  decodeCursor,
  paginateByCursor,
  type CursorPage,
} from '../common/dto/cursor-pagination';
import type { QueryAuditDto } from './dto/query-audit.dto';

export type AuditEntityType =
  | 'User'
  | 'Article'
  | 'Category'
  | 'Loan'
  | 'Organization'
  | 'OrganizationUnit'
  | 'Location'
  | 'Room'
  | 'Role'
  | 'Group'
  | 'InventoryItem'
  | 'LoanBlackoutPeriod'
  | 'LoanTemplate'
  | 'StickerProfile';

/** Maps an entity type to its audit category. Used both by manual log() calls (when no category is given) and the AuditInterceptor. */
const CATEGORY_BY_ENTITY_TYPE: Record<AuditEntityType, AuditCategory> = {
  User: AuditCategory.person,
  Article: AuditCategory.article,
  Category: AuditCategory.article,
  Loan: AuditCategory.loan,
  LoanBlackoutPeriod: AuditCategory.loan,
  LoanTemplate: AuditCategory.loan,
  Organization: AuditCategory.other,
  OrganizationUnit: AuditCategory.other,
  Location: AuditCategory.other,
  Room: AuditCategory.other,
  Role: AuditCategory.role,
  Group: AuditCategory.group,
  InventoryItem: AuditCategory.inventory,
  StickerProfile: AuditCategory.other,
};

export function categoryForEntityType(
  entityType: AuditEntityType | string,
): AuditCategory {
  return (
    CATEGORY_BY_ENTITY_TYPE[entityType as AuditEntityType] ??
    AuditCategory.other
  );
}

// Keys never persisted in a before/after snapshot, wherever they appear -
// these are internal/sensitive values (auth secrets, credential material),
// never something an audit reviewer needs to see.
const REDACTED_KEYS = new Set([
  'passwordHash',
  'password',
  'tokenHash',
  'publicKey',
  'credentialId',
  'passwordEnc',
  'onedriveRefreshTokenEnc',
  'sftpPasswordEnc',
]);

/** Shallow-redacts known-sensitive fields from an entity snapshot before it's stored. */
export function redactSnapshot(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    return value as Prisma.InputJsonValue;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = REDACTED_KEYS.has(key) ? '[redacted]' : val;
  }
  return redacted as Prisma.InputJsonValue;
}

interface LogParams {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  summary: string;
  userId?: string;
  category?: AuditCategory;
  before?: unknown;
  after?: unknown;
}

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an entity-level change. Pass a transaction client (`tx`) when
   * called from inside a `$transaction` block so the audit entry commits
   * (or rolls back) atomically with the mutation it describes.
   *
   * This is the lower-level primitive: most straightforward CRUD routes are
   * now audited automatically by AuditInterceptor (see audit.interceptor.ts)
   * via the @Audited() decorator. Call this directly for workflow actions
   * that don't map onto a single REST create/update/delete (loan approve/
   * issue/return, role/group membership changes, password resets, ...).
   */
  async log(params: LogParams, client: Client = this.prisma): Promise<void> {
    await client.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        summary: params.summary,
        userId: params.userId,
        category: params.category ?? categoryForEntityType(params.entityType),
        beforeData:
          params.before !== undefined
            ? (redactSnapshot(params.before) ?? Prisma.JsonNull)
            : undefined,
        afterData:
          params.after !== undefined
            ? (redactSnapshot(params.after) ?? Prisma.JsonNull)
            : undefined,
      },
    });
  }

  /**
   * Filterable, keyset-paginated log listing for GET /audit (audit.read).
   * Ordered newest-first by (createdAt, id) - cursor is opaque, derived
   * from the last row's sort key, so pages stay stable and cheap even as
   * the table grows into the millions of rows (no OFFSET scan).
   */
  async findAll(
    query: QueryAuditDto,
  ): Promise<CursorPage<Prisma.AuditLogGetPayload<{
    include: { user: { select: { id: true; displayName: true } } };
  }>>> {
    const limit = query.limit ?? 50;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.actorUserId ? { userId: query.actorUserId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    if (query.cursor) {
      const { createdAt, id } = decodeCursor<{ createdAt: string; id: string }>(
        query.cursor,
      );
      where.OR = [
        { createdAt: { lt: new Date(createdAt) } },
        { createdAt: new Date(createdAt), id: { lt: id } },
      ];
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return paginateByCursor(rows, limit, (row) => ({
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    }));
  }
}
