import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEntityType =
  | 'User'
  | 'Article'
  | 'Loan'
  | 'Organization'
  | 'Location'
  | 'Role'
  | 'Group'
  | 'InventoryItem'
  | 'LoanBlackoutPeriod'
  | 'LoanTemplate';

interface LogParams {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  summary: string;
  userId?: string;
}

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an entity-level create/update/delete. Pass a transaction client
   * (`tx`) when called from inside a `$transaction` block so the audit entry
   * commits (or rolls back) atomically with the mutation it describes.
   */
  async log(params: LogParams, client: Client = this.prisma): Promise<void> {
    await client.auditLog.create({ data: params });
  }
}
