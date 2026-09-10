import { SetMetadata } from '@nestjs/common';
import { AuditAction, AuditCategory } from '../generated/prisma/client';
import type { AuditEntityType } from './audit.service';

export const AUDITED_KEY = 'audited';

export interface AuditedMetadata {
  entityType: AuditEntityType;
  category: AuditCategory;
  /** Overrides the HTTP-method-derived action - needed for a non-create POST route like ".../move". */
  action?: AuditAction;
}

/**
 * Marks a mutating controller route (POST/PUT/PATCH/DELETE) for automatic
 * audit logging by the global AuditInterceptor: it derives the action from
 * the HTTP method (override with `action` for a POST route that isn't a
 * creation, e.g. ".../move"), fetches a "before" snapshot for update/delete
 * via a generic Prisma lookup, and records the response body as "after"
 * for create/update. Use this for straightforward single-entity CRUD; for
 * workflow actions that don't map onto one REST verb 1:1 (approve/issue/
 * return a loan, reset a password, ...), call AuditService.log() directly
 * instead.
 */
export const Audited = (
  entityType: AuditEntityType,
  category: AuditCategory,
  action?: AuditAction,
) =>
  SetMetadata(AUDITED_KEY, {
    entityType,
    category,
    action,
  } satisfies AuditedMetadata);
