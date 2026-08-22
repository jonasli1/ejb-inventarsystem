import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryItem,
  InventoryStatus,
  LoanSource,
  LoanStatus,
  Prisma,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
import { LoanTemplatesService } from './loan-templates.service';
import { EmailService } from '../notifications/email.service';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateLoanDto, CreateLoanItemDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { ReturnLoanDto } from './dto/return-loan.dto';
import { IssueLoanDto } from './dto/issue-loan.dto';
import { QueryLoanDto } from './dto/query-loan.dto';

const LOAN_INCLUDE = {
  lentBy: { select: { id: true, displayName: true, email: true } },
  items: { include: { inventoryItem: { include: { article: true } } } },
} satisfies Prisma.LoanInclude;

// A loan is a "live" claim on an inventory item's future availability while
// it's in any of these statuses; only `completed` frees the item up.
const ACTIVE_LOAN_STATUSES: LoanStatus[] = [
  LoanStatus.requested,
  LoanStatus.approved,
  LoanStatus.issued,
];

// installed/maintenance/defect/retired items must have their status changed
// manually before they can be part of any loan, at any permission tier.
const BOOKABLE_STATUSES: InventoryStatus[] = [
  InventoryStatus.available,
  InventoryStatus.borrowed,
];

type ActorTier = 'administer' | 'manage' | 'create' | null;

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly groups: GroupsService,
    private readonly loanTemplates: LoanTemplatesService,
    private readonly email: EmailService,
  ) {}

  async findAll(query: QueryLoanDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.LoanWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.borrowerPersonId
        ? { borrowerPersonId: query.borrowerPersonId }
        : {}),
      ...(query.lentByUserId ? { lentByUserId: query.lentByUserId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.loan.findMany({
        where,
        include: LOAN_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { checkoutDate: 'desc' },
      }),
      this.prisma.loan.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  /** Lightweight listing for the calendar view: every loan overlapping [from, to]. */
  async calendar(from: Date, to: Date) {
    const loans = await this.prisma.loan.findMany({
      where: {
        deletedAt: null,
        checkoutDate: { lte: to },
        OR: [{ dueDate: null }, { dueDate: { gte: from } }],
      },
      select: {
        id: true,
        borrowerName: true,
        borrowerPersonId: true,
        status: true,
        checkoutDate: true,
        dueDate: true,
        _count: { select: { items: true } },
      },
      orderBy: { checkoutDate: 'asc' },
    });
    return loans.map(({ _count, ...loan }) => ({
      ...loan,
      itemCount: _count.items,
    }));
  }

  async findOne(id: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id, deletedAt: null },
      include: LOAN_INCLUDE,
    });
    if (!loan) throw new NotFoundException('Loan not found.');
    return loan;
  }

  // -------------------------------------------------------------------------
  // Permission tiers / organization scoping
  // -------------------------------------------------------------------------

  private resolveActorTier(user: AuthenticatedUser): ActorTier {
    if (user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER))
      return 'administer';
    if (user.permissions.includes(PERMISSIONS.LOANS_MANAGE)) return 'manage';
    if (user.permissions.includes(PERMISSIONS.LOANS_CREATE)) return 'create';
    return null;
  }

  /** Throws unless the actor may approve/issue/return/edit/reset this loan. */
  private async assertCanManageLoan(
    loan: { items: { inventoryItem: { ownerOrganizationId: string } }[] },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER)) return;
    if (!user.permissions.includes(PERMISSIONS.LOANS_MANAGE)) {
      throw new ForbiddenException(
        'You do not have permission to manage this loan.',
      );
    }
    const userOrgIds = new Set(
      await this.groups.getOrganizationIdsForUser(user.id),
    );
    const outOfScope = loan.items.find(
      (i) => !userOrgIds.has(i.inventoryItem.ownerOrganizationId),
    );
    if (outOfScope) {
      throw new ForbiddenException(
        'This loan includes items belonging to an organization you do not manage.',
      );
    }
  }

  private async assertItemsWithinActorOrganizations(
    items: Pick<
      InventoryItem,
      'id' | 'inventoryNumber' | 'ownerOrganizationId'
    >[],
    userId: string,
  ): Promise<void> {
    const userOrgIds = new Set(
      await this.groups.getOrganizationIdsForUser(userId),
    );
    const outOfScope = items.find(
      (i) => !userOrgIds.has(i.ownerOrganizationId),
    );
    if (outOfScope) {
      throw new ForbiddenException(
        `Inventory item ${outOfScope.inventoryNumber} does not belong to one of your organizations.`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Item resolution / availability
  // -------------------------------------------------------------------------

  private assertBookableStatus(
    item: Pick<InventoryItem, 'status' | 'inventoryNumber'>,
  ): void {
    if (!BOOKABLE_STATUSES.includes(item.status)) {
      throw new BadRequestException(
        `Inventory item ${item.inventoryNumber} has status "${item.status}" and must be changed before it can be part of a loan.`,
      );
    }
  }

  private async hasSchedulingConflict(
    inventoryItemId: string,
    checkoutDate: Date,
    dueDate: Date | null,
    excludeLoanId?: string,
  ): Promise<boolean> {
    const conflict = await this.prisma.loanItem.findFirst({
      where: {
        inventoryItemId,
        loan: {
          status: { in: ACTIVE_LOAN_STATUSES },
          ...(excludeLoanId ? { id: { not: excludeLoanId } } : {}),
          AND: [
            dueDate ? { checkoutDate: { lte: dueDate } } : {},
            { OR: [{ dueDate: null }, { dueDate: { gte: checkoutDate } }] },
          ],
        },
      },
      select: { id: true },
    });
    return !!conflict;
  }

  /**
   * Blackout periods block ALL loans -- regardless of permission tier -- for
   * their [startDate, endDate] window. Checked once per create/reschedule,
   * not per item (unlike hasSchedulingConflict, which is per inventory item).
   */
  private async assertNoBlackoutConflict(
    checkoutDate: Date,
    dueDate: Date | null,
  ): Promise<void> {
    // Without a due date the loan's end is unknown, so we can't check for a
    // range overlap; the narrowest well-defined check is whether the
    // checkout moment itself falls inside a blackout period. (Checking
    // `endDate >= checkoutDate` alone, unconditionally, would make any loan
    // without a due date conflict with every blackout period scheduled
    // afterwards, forever.)
    const conflict = await this.prisma.loanBlackoutPeriod.findFirst({
      where: dueDate
        ? { startDate: { lte: dueDate }, endDate: { gte: checkoutDate } }
        : { startDate: { lte: checkoutDate }, endDate: { gte: checkoutDate } },
      select: { id: true, reason: true, startDate: true, endDate: true },
    });
    if (conflict) {
      throw new BadRequestException(
        `The requested period overlaps a blackout period (${conflict.startDate.toISOString().slice(0, 10)} – ${conflict.endDate.toISOString().slice(0, 10)}${conflict.reason ? `: ${conflict.reason}` : ''}) during which no loans are possible.`,
      );
    }
  }

  /**
   * Resolves loan item specs (by inventoryItemId or by articleId+quantity) to
   * concrete inventory items, checking that each is bookable and free for the
   * requested [checkoutDate, dueDate] window. Works identically for immediate
   * and future-dated loans -- there is no separate "reserved" status, this
   * date-overlap check against other active loans' items is the only gate.
   */
  private async resolveCheckoutItems(
    items: CreateLoanItemDto[],
    checkoutDate: Date,
    dueDate: Date | null,
    excludeLoanId?: string,
  ): Promise<InventoryItem[]> {
    const resolved: InventoryItem[] = [];
    const usedIds = new Set<string>();

    for (const spec of items) {
      if (spec.inventoryItemId) {
        const item = await this.prisma.inventoryItem.findFirst({
          where: { id: spec.inventoryItemId, deletedAt: null },
        });
        if (!item)
          throw new NotFoundException(
            `Inventory item ${spec.inventoryItemId} not found.`,
          );
        if (usedIds.has(item.id)) {
          throw new BadRequestException(
            `Inventory item ${item.inventoryNumber} was selected twice.`,
          );
        }
        this.assertBookableStatus(item);
        if (
          await this.hasSchedulingConflict(
            item.id,
            checkoutDate,
            dueDate,
            excludeLoanId,
          )
        ) {
          throw new BadRequestException(
            `Inventory item ${item.inventoryNumber} is already booked for the requested period.`,
          );
        }
        usedIds.add(item.id);
        resolved.push(item);
        continue;
      }

      if (spec.articleId) {
        const quantity = spec.quantity ?? 1;
        const candidates = await this.prisma.inventoryItem.findMany({
          where: {
            articleId: spec.articleId,
            deletedAt: null,
            status: { in: BOOKABLE_STATUSES },
            id: { notIn: [...usedIds] },
          },
        });
        const picked: InventoryItem[] = [];
        for (const candidate of candidates) {
          if (picked.length >= quantity) break;
          if (
            !(await this.hasSchedulingConflict(
              candidate.id,
              checkoutDate,
              dueDate,
              excludeLoanId,
            ))
          ) {
            picked.push(candidate);
          }
        }
        if (picked.length < quantity) {
          throw new BadRequestException(
            `Not enough available units for article ${spec.articleId} in the requested period: requested ${quantity}, found ${picked.length}.`,
          );
        }
        for (const item of picked) {
          usedIds.add(item.id);
          resolved.push(item);
        }
        continue;
      }

      throw new BadRequestException(
        'Each loan item requires inventoryItemId or articleId.',
      );
    }

    return resolved;
  }

  // -------------------------------------------------------------------------
  // Create / update
  // -------------------------------------------------------------------------

  async create(dto: CreateLoanDto, user: AuthenticatedUser) {
    if (!dto.borrowerPersonId && !dto.borrowerName) {
      throw new BadRequestException(
        'Either borrowerPersonId or borrowerName must be provided.',
      );
    }

    const tier = this.resolveActorTier(user);
    if (!tier)
      throw new ForbiddenException(
        'You do not have permission to create loans.',
      );

    const checkoutDate = dto.checkoutDate
      ? new Date(dto.checkoutDate)
      : new Date();
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    await this.assertNoBlackoutConflict(checkoutDate, dueDate);
    const resolvedItems = await this.resolveCheckoutItems(
      dto.items,
      checkoutDate,
      dueDate,
    );

    let status: LoanStatus = LoanStatus.requested;
    if (tier === 'administer') {
      status = dto.forceRequested ? LoanStatus.requested : LoanStatus.approved;
    } else if (tier === 'manage') {
      await this.assertItemsWithinActorOrganizations(resolvedItems, user.id);
      status = dto.forceRequested ? LoanStatus.requested : LoanStatus.approved;
    }
    // tier === 'create': always requested, any organization, forceRequested ignored.

    const createdLoan = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          borrowerPersonId: dto.borrowerPersonId,
          borrowerName: dto.borrowerName,
          borrowerStreet: dto.borrowerStreet,
          borrowerCity: dto.borrowerCity,
          borrowerEmail: dto.borrowerEmail,
          borrowerPhone: dto.borrowerPhone,
          lentByUserId: user.id,
          source: LoanSource.internal,
          checkoutDate,
          dueDate: dueDate ?? undefined,
          status,
          notes: dto.notes,
        },
      });

      for (const item of resolvedItems) {
        await tx.loanItem.create({
          data: { loanId: loan.id, inventoryItemId: item.id },
        });
      }

      await this.audit.log(
        {
          entityType: 'Loan',
          entityId: loan.id,
          action: 'create',
          summary: `Ausleihe für "${dto.borrowerName ?? dto.borrowerPersonId}" mit ${resolvedItems.length} Objekt(en) angelegt (Status: ${status})`,
          userId: user.id,
        },
        tx,
      );

      return tx.loan.findUniqueOrThrow({
        where: { id: loan.id },
        include: LOAN_INCLUDE,
      });
    });

    if (dto.saveAsTemplate && tier === 'administer') {
      await this.loanTemplates.createFromResolvedItems(
        dto.saveAsTemplate.name,
        resolvedItems.map((i) => i.articleId),
        user.id,
      );
    }

    if (status === LoanStatus.requested) {
      await this.email.notifyEvent(
        'loan.requested',
        'Neue Ausleihe wartet auf Genehmigung',
        `Eine neue Ausleihe für "${dto.borrowerName ?? dto.borrowerPersonId}" mit ${resolvedItems.length} Objekt(en) wartet auf Genehmigung.`,
      );
    }

    return createdLoan;
  }

  async update(loanId: string, dto: UpdateLoanDto, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    if (loan.status === LoanStatus.completed) {
      throw new BadRequestException('Completed loans can no longer be edited.');
    }
    await this.assertCanManageLoan(loan, user);

    const checkoutDate = dto.checkoutDate
      ? new Date(dto.checkoutDate)
      : loan.checkoutDate;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : loan.dueDate;
    if (dto.checkoutDate || dto.dueDate) {
      await this.assertNoBlackoutConflict(checkoutDate, dueDate);
    }

    let toRemove: (typeof loan.items)[number][] = [];
    let toAdd: InventoryItem[] = [];
    if (dto.items) {
      const desiredIds = new Set(dto.items.map((i) => i.inventoryItemId));
      const currentIds = new Set(loan.items.map((i) => i.inventoryItemId));
      toRemove = loan.items.filter((li) => !desiredIds.has(li.inventoryItemId));
      const newIds = dto.items
        .map((i) => i.inventoryItemId)
        .filter((id) => !currentIds.has(id));
      toAdd = await this.resolveCheckoutItems(
        newIds.map((inventoryItemId) => ({ inventoryItemId })),
        checkoutDate,
        dueDate,
        loanId,
      );
      if (!user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER)) {
        await this.assertItemsWithinActorOrganizations(toAdd, user.id);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const li of toRemove) {
        if (loan.status === LoanStatus.issued && !li.returnedAt) {
          await tx.inventoryItem.update({
            where: { id: li.inventoryItemId },
            data: { status: InventoryStatus.available },
          });
          await tx.stockMovement.create({
            data: {
              inventoryItemId: li.inventoryItemId,
              type: StockMovementType.status_change,
              oldStatus: InventoryStatus.borrowed,
              newStatus: InventoryStatus.available,
              userId: user.id,
              note: `Aus Ausleihe ${loanId} entfernt`,
            },
          });
        }
        await tx.loanItem.delete({ where: { id: li.id } });
      }

      for (const item of toAdd) {
        const created = await tx.loanItem.create({
          data: { loanId, inventoryItemId: item.id },
        });
        if (loan.status === LoanStatus.issued) {
          await tx.loanItem.update({
            where: { id: created.id },
            data: { checkedOutCondition: item.conditionPercent },
          });
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { status: InventoryStatus.borrowed },
          });
          await tx.stockMovement.create({
            data: {
              inventoryItemId: item.id,
              type: StockMovementType.status_change,
              oldStatus: item.status,
              newStatus: InventoryStatus.borrowed,
              userId: user.id,
              note: `Zu laufender Ausleihe ${loanId} hinzugefügt`,
            },
          });
        }
      }

      await tx.loan.update({
        where: { id: loanId },
        data: {
          borrowerPersonId: dto.borrowerPersonId,
          borrowerName: dto.borrowerName,
          borrowerStreet: dto.borrowerStreet,
          borrowerCity: dto.borrowerCity,
          borrowerEmail: dto.borrowerEmail,
          borrowerPhone: dto.borrowerPhone,
          checkoutDate: dto.checkoutDate ? checkoutDate : undefined,
          dueDate: dto.dueDate ? dueDate : undefined,
          notes: dto.notes,
        },
      });

      await this.audit.log(
        {
          entityType: 'Loan',
          entityId: loanId,
          action: 'update',
          summary: `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" bearbeitet`,
          userId: user.id,
        },
        tx,
      );

      return tx.loan.findUniqueOrThrow({
        where: { id: loanId },
        include: LOAN_INCLUDE,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Status workflow: requested -> approved -> issued -> completed
  // -------------------------------------------------------------------------

  async approve(loanId: string, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    if (loan.status !== LoanStatus.requested) {
      throw new BadRequestException(
        `Only requested loans can be approved (current status: ${loan.status}).`,
      );
    }
    await this.assertCanManageLoan(loan, user);

    await this.prisma.loan.update({
      where: { id: loanId },
      data: { status: LoanStatus.approved },
    });
    await this.audit.log({
      entityType: 'Loan',
      entityId: loanId,
      action: 'update',
      summary: `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" genehmigt`,
      userId: user.id,
    });
    await this.email.notifyEvent(
      'loan.approved',
      'Ausleihe genehmigt',
      `Die Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" wurde genehmigt.`,
    );
    return this.findOne(loanId);
  }

  /** The physical hand-out step ("Ausgabe-Prozess"): captures condition, flips items to borrowed. */
  async issue(loanId: string, dto: IssueLoanDto, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    if (loan.status !== LoanStatus.approved) {
      throw new BadRequestException(
        `Only approved loans can be issued (current status: ${loan.status}).`,
      );
    }
    await this.assertCanManageLoan(loan, user);

    const overrides = new Map(
      (dto.items ?? []).map((i) => [i.loanItemId, i.checkedOutCondition]),
    );
    const unknownIds = [...overrides.keys()].filter(
      (id) => !loan.items.some((li) => li.id === id),
    );
    if (unknownIds.length) {
      throw new BadRequestException(
        `Loan item(s) ${unknownIds.join(', ')} do not belong to loan ${loanId}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const loanItem of loan.items) {
        const condition = overrides.has(loanItem.id)
          ? (overrides.get(loanItem.id) ?? null)
          : loanItem.inventoryItem.conditionPercent;

        await tx.loanItem.update({
          where: { id: loanItem.id },
          data: { checkedOutCondition: condition },
        });
        await tx.inventoryItem.update({
          where: { id: loanItem.inventoryItemId },
          data: { status: InventoryStatus.borrowed },
        });
        await tx.stockMovement.create({
          data: {
            inventoryItemId: loanItem.inventoryItemId,
            type: StockMovementType.status_change,
            oldStatus: loanItem.inventoryItem.status,
            newStatus: InventoryStatus.borrowed,
            userId: user.id,
            note: `Ausgegeben via Ausleihe ${loanId}`,
          },
        });
      }

      await tx.loan.update({
        where: { id: loanId },
        data: { status: LoanStatus.issued, issuedAt: new Date() },
      });

      await this.audit.log(
        {
          entityType: 'Loan',
          entityId: loanId,
          action: 'update',
          summary: `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" ausgegeben`,
          userId: user.id,
        },
        tx,
      );
    });

    await this.email.notifyEvent(
      'loan.issued',
      'Ausleihe ausgegeben',
      `Die Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" wurde ausgegeben.`,
    );

    return this.findOne(loanId);
  }

  async resetStatus(loanId: string, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    await this.assertCanManageLoan(loan, user);
    if (loan.status === LoanStatus.requested) {
      throw new BadRequestException('Loan is already in "requested" status.');
    }

    await this.prisma.loan.update({
      where: { id: loanId },
      data: { status: LoanStatus.requested },
    });
    await this.audit.log({
      entityType: 'Loan',
      entityId: loanId,
      action: 'update',
      summary: `Status der Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" auf "beantragt" zurückgesetzt`,
      userId: user.id,
    });
    return this.findOne(loanId);
  }

  async returnLoan(
    loanId: string,
    dto: ReturnLoanDto,
    user: AuthenticatedUser,
  ) {
    const loan = await this.findOne(loanId);
    if (loan.status !== LoanStatus.issued) {
      throw new BadRequestException(
        `Only issued loans can be returned (current status: ${loan.status}).`,
      );
    }
    await this.assertCanManageLoan(loan, user);

    const loanItemIds = new Set(loan.items.map((i) => i.id));
    for (const returnItem of dto.items) {
      if (!loanItemIds.has(returnItem.loanItemId)) {
        throw new BadRequestException(
          `Loan item ${returnItem.loanItemId} does not belong to loan ${loanId}.`,
        );
      }
    }

    let allReturned = false;
    await this.prisma.$transaction(async (tx) => {
      for (const returnItem of dto.items) {
        const loanItem = loan.items.find(
          (i) => i.id === returnItem.loanItemId,
        )!;
        if (loanItem.returnedAt) continue;

        const newStatus = returnItem.newStatus ?? InventoryStatus.available;
        const isConsumable =
          loanItem.inventoryItem.article.type === 'CONSUMABLE';

        await tx.loanItem.update({
          where: { id: loanItem.id },
          data: {
            returnedAt: new Date(),
            returnedCondition: isConsumable
              ? returnItem.returnedCondition
              : undefined,
          },
        });

        await tx.inventoryItem.update({
          where: { id: loanItem.inventoryItemId },
          data: {
            status: newStatus,
            ...(isConsumable && returnItem.returnedCondition !== undefined
              ? { conditionPercent: returnItem.returnedCondition }
              : {}),
          },
        });

        await tx.stockMovement.create({
          data: {
            inventoryItemId: loanItem.inventoryItemId,
            type: StockMovementType.status_change,
            oldStatus: loanItem.inventoryItem.status,
            newStatus,
            oldCondition: loanItem.inventoryItem.conditionPercent,
            newCondition:
              isConsumable && returnItem.returnedCondition !== undefined
                ? returnItem.returnedCondition
                : loanItem.inventoryItem.conditionPercent,
            userId: user.id,
            note: `Returned via loan ${loanId}`,
          },
        });
      }

      const refreshedItems = await tx.loanItem.findMany({ where: { loanId } });
      allReturned = refreshedItems.every((i) => i.returnedAt !== null);

      await tx.loan.update({
        where: { id: loanId },
        data: {
          status: allReturned ? LoanStatus.completed : LoanStatus.issued,
          returnedAt: allReturned ? new Date() : undefined,
          notes: dto.notes ?? undefined,
        },
      });

      await this.audit.log(
        {
          entityType: 'Loan',
          entityId: loanId,
          action: 'update',
          summary: allReturned
            ? `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" vollständig zurückgegeben`
            : `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" teilweise zurückgegeben`,
          userId: user.id,
        },
        tx,
      );
    });

    if (allReturned) {
      await this.email.notifyEvent(
        'loan.returned',
        'Ausleihe vollständig zurückgegeben',
        `Die Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" wurde vollständig zurückgegeben.`,
      );
    }

    return this.findOne(loanId);
  }
}
