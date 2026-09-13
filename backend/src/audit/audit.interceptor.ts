import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction } from '../generated/prisma/client';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AUDITED_KEY, type AuditedMetadata } from './audited.decorator';
import { AuditService, type AuditEntityType } from './audit.service';

// Prisma client accessor (camelCase) for each auditable entity type - used
// for the generic "before" lookup on update/delete.
const MODEL_ACCESSOR: Record<AuditEntityType, string> = {
  User: 'user',
  Article: 'article',
  Category: 'category',
  Loan: 'loan',
  Organization: 'organization',
  OrganizationUnit: 'organizationUnit',
  Location: 'location',
  Room: 'room',
  Role: 'role',
  Group: 'group',
  InventoryItem: 'inventoryItem',
  LoanBlackoutPeriod: 'loanBlackoutPeriod',
  LoanTemplate: 'loanTemplate',
  StickerProfile: 'stickerProfile',
};

const ACTION_BY_METHOD: Record<string, AuditAction> = {
  POST: AuditAction.create,
  PUT: AuditAction.update,
  PATCH: AuditAction.update,
  DELETE: AuditAction.delete,
};

/**
 * Centralized audit logging for straightforward single-entity CRUD routes,
 * driven by the @Audited() decorator (see audited.decorator.ts). Derives
 * the action from the HTTP method, fetches a "before" snapshot generically
 * via Prisma for update/delete, and records the response body as "after"
 * for create/update - so individual services don't need their own
 * AuditService.log() call for plain create/update/delete.
 *
 * Workflow actions that don't map onto a single REST verb (loan approve/
 * issue/return, password resets, role/group membership changes, ...) are
 * NOT covered here and keep their existing direct AuditService.log() calls.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const meta = this.reflector.get<AuditedMetadata | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const action = meta.action ?? ACTION_BY_METHOD[request.method];
    if (!action) return next.handle();

    const paramId = (request.params as Record<string, string> | undefined)?.id;
    const before =
      action !== AuditAction.create && paramId
        ? await this.fetchSnapshot(meta.entityType, paramId)
        : undefined;

    return next.handle().pipe(
      tap((response) => {
        const entityId =
          action === AuditAction.create
            ? ((response as { id?: string } | undefined)?.id ?? paramId)
            : paramId;
        if (!entityId) return;

        const after = action === AuditAction.delete ? undefined : response;
        const user = (request as unknown as { user?: AuthenticatedUser }).user;

        this.audit
          .log({
            entityType: meta.entityType,
            entityId,
            action,
            category: meta.category,
            summary: this.describe(meta.entityType, action, before, after),
            userId: user?.id,
            before,
            after,
          })
          .catch((err) =>
            this.logger.error(
              `Failed to write audit log entry for ${meta.entityType}/${entityId}`,
              err instanceof Error ? err.stack : undefined,
            ),
          );
      }),
    );
  }

  private async fetchSnapshot(
    entityType: AuditEntityType,
    id: string,
  ): Promise<unknown> {
    const accessor = MODEL_ACCESSOR[entityType];
    try {
      const model = (this.prisma as unknown as Record<string, { findUnique: (args: unknown) => Promise<unknown> }>)[
        accessor
      ];
      return await model.findUnique({ where: { id } });
    } catch (err) {
      this.logger.warn(
        `Could not fetch "before" snapshot for ${entityType}/${id}: ${err instanceof Error ? err.message : err}`,
      );
      return undefined;
    }
  }

  private describe(
    entityType: AuditEntityType,
    action: AuditAction,
    before: unknown,
    after: unknown,
  ): string {
    const ACTION_LABEL: Record<AuditAction, string> = {
      create: 'angelegt',
      update: 'aktualisiert',
      delete: 'gelöscht',
      login: 'angemeldet',
      login_failed: 'Anmeldung fehlgeschlagen',
      logout: 'abgemeldet',
    };
    const name = this.pickDisplayName(after) ?? this.pickDisplayName(before);
    const label = ENTITY_LABEL[entityType] ?? entityType;
    return name
      ? `${label} "${name}" ${ACTION_LABEL[action]}`
      : `${label} ${ACTION_LABEL[action]}`;
  }

  private pickDisplayName(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const obj = value as Record<string, unknown>;
    for (const key of ['name', 'displayName', 'inventoryNumber', 'email']) {
      if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
    }
    return undefined;
  }
}

const ENTITY_LABEL: Record<AuditEntityType, string> = {
  User: 'Benutzer',
  Article: 'Artikel',
  Category: 'Kategorie',
  Loan: 'Ausleihe',
  Organization: 'Organisation',
  OrganizationUnit: 'Organisationsbereich',
  Location: 'Standort',
  Room: 'Raum',
  Role: 'Rolle',
  Group: 'Gruppe',
  InventoryItem: 'Inventarobjekt',
  LoanBlackoutPeriod: 'Ausleihsperre',
  LoanTemplate: 'Ausleihe-Vorlage',
  StickerProfile: 'Sticker-Profil',
};
