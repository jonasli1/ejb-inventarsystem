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
import { GroupsService, type LoanScopeEntry } from '../groups/groups.service';
import { LoanTemplatesService } from './loan-templates.service';
import { EmailService } from '../notifications/email.service';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateLoanDto, CreateLoanItemDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { ReturnLoanDto } from './dto/return-loan.dto';
import { IssueLoanDto } from './dto/issue-loan.dto';
import { ApproveLoanDto } from './dto/approve-loan.dto';
import { QueryLoanDto } from './dto/query-loan.dto';

const LOAN_INCLUDE = {
  lentBy: { select: { id: true, displayName: true, email: true } },
  items: {
    include: {
      inventoryItem: { include: { article: true } },
      approvedBy: { select: { id: true, displayName: true } },
    },
  },
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

  // `actor` is only passed by the controller's single-loan GET; every
  // internal call site (approve/issue/return/update/...) omits it since
  // those already run their own, more specific authorization checks.
  async findOne(id: string, actor?: AuthenticatedUser) {
    const loan = await this.prisma.loan.findFirst({
      where: { id, deletedAt: null },
      include: LOAN_INCLUDE,
    });
    if (!loan) throw new NotFoundException('Loan not found.');
    if (actor) this.assertCanViewLoan(loan, actor);
    return loan;
  }

  /**
   * findOne()'s actor check: the loan's creator may always look it up (even
   * with only loans.create - e.g. after a reload, or via the movement
   * history's "go to loan" link), matching assertCanEditLoan's same
   * creator-always-allowed carve-out. Everyone else needs an actual
   * view-tier-and-above permission.
   */
  private assertCanViewLoan(
    loan: { lentByUserId: string },
    user: AuthenticatedUser,
  ): void {
    if (loan.lentByUserId === user.id) return;
    const hasViewTier = [
      PERMISSIONS.LOANS_VIEW,
      PERMISSIONS.LOANS_MANAGE,
      PERMISSIONS.LOANS_SPEND,
      PERMISSIONS.LOANS_ADMINISTER,
    ].some((p) => user.permissions.includes(p));
    if (!hasViewTier) {
      throw new ForbiddenException(
        'You do not have permission to view this loan.',
      );
    }
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

  /** Whether an item's (org, unit) falls within any of the given scope entries. */
  private isItemInScope(
    scope: LoanScopeEntry[],
    item: { ownerOrganizationId: string; ownerUnitId: string },
  ): boolean {
    return scope.some(
      (s) =>
        s.organizationId === item.ownerOrganizationId &&
        (s.organizationUnitId === null ||
          s.organizationUnitId === item.ownerUnitId),
    );
  }

  /** create()'s loans.manage fast-path: a hard block, not just an approval gate. */
  private async assertItemsWithinActorScope(
    items: Pick<
      InventoryItem,
      'id' | 'inventoryNumber' | 'ownerOrganizationId' | 'ownerUnitId'
    >[],
    userId: string,
  ): Promise<void> {
    const scope = await this.groups.getLoanScopeForUser(userId);
    const outOfScope = items.find((i) => !this.isItemInScope(scope, i));
    if (outOfScope) {
      throw new ForbiddenException(
        `Inventory item ${outOfScope.inventoryNumber} does not belong to one of your organizations/units.`,
      );
    }
  }

  /**
   * update(): the loan's creator may always edit it, even with only
   * loans.create. loans.manage may edit ANY loan, unconditionally (no org/unit
   * check - unlike approving, which stays scoped). loans.administer as ever.
   */
  private assertCanEditLoan(
    loan: { lentByUserId: string },
    user: AuthenticatedUser,
  ): void {
    if (loan.lentByUserId === user.id) return;
    if (user.permissions.includes(PERMISSIONS.LOANS_MANAGE)) return;
    if (user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER)) return;
    throw new ForbiddenException(
      'You do not have permission to edit this loan.',
    );
  }

  /** resetStatus(): mirrors the pre-split whole-loan manage/administer check. */
  private async assertCanResetStatus(
    loan: {
      items: {
        inventoryItem: { ownerOrganizationId: string; ownerUnitId: string };
      }[];
    },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER)) return;
    if (!user.permissions.includes(PERMISSIONS.LOANS_MANAGE)) {
      throw new ForbiddenException(
        'You do not have permission to manage this loan.',
      );
    }
    const scope = await this.groups.getLoanScopeForUser(user.id);
    const outOfScope = loan.items.find(
      (i) => !this.isItemInScope(scope, i.inventoryItem),
    );
    if (outOfScope) {
      throw new ForbiddenException(
        'This loan includes items belonging to an organization/unit you do not manage.',
      );
    }
  }

  /**
   * issue(): loans.spend or loans.administer may issue ANY loan, regardless
   * of organization/unit - unlike approving, issuing/returning is not
   * scoped to the actor's groups (a warehouse/spend role is assumed to
   * physically hand out and take back items for the whole inventory).
   */
  private assertCanIssue(user: AuthenticatedUser): void {
    if (
      !user.permissions.includes(PERMISSIONS.LOANS_SPEND) &&
      !user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER)
    ) {
      throw new ForbiddenException(
        'You do not have permission to issue this loan.',
      );
    }
  }

  /** returnLoan(): same unscoped loans.spend/loans.administer check as issue(). */
  private assertCanReturnItems(user: AuthenticatedUser): void {
    if (
      !user.permissions.includes(PERMISSIONS.LOANS_SPEND) &&
      !user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER)
    ) {
      throw new ForbiddenException(
        'You do not have permission to return items on this loan.',
      );
    }
  }

  /**
   * approve(): resolves which currently-unapproved loan items the actor may
   * approve on this call, honoring an optional explicit itemIds filter.
   */
  private async resolveApprovableItems(
    loan: {
      items: {
        id: string;
        approvedAt: Date | null;
        inventoryItem: { ownerOrganizationId: string; ownerUnitId: string };
      }[];
    },
    dto: ApproveLoanDto,
    user: AuthenticatedUser,
  ): Promise<string[]> {
    const isAdminister = user.permissions.includes(
      PERMISSIONS.LOANS_ADMINISTER,
    );
    if (!isAdminister && !user.permissions.includes(PERMISSIONS.LOANS_MANAGE)) {
      throw new ForbiddenException(
        'You do not have permission to approve this loan.',
      );
    }

    const unapproved = loan.items.filter((i) => !i.approvedAt);

    if (isAdminister) {
      const items = dto.itemIds
        ? unapproved.filter((i) => dto.itemIds!.includes(i.id))
        : unapproved;
      return items.map((i) => i.id);
    }

    const scope = await this.groups.getLoanScopeForUser(user.id);
    const inScope = unapproved.filter((i) =>
      this.isItemInScope(scope, i.inventoryItem),
    );

    if (dto.itemIds) {
      const inScopeIds = new Set(inScope.map((i) => i.id));
      const outOfScope = dto.itemIds.find((id) => !inScopeIds.has(id));
      if (outOfScope) {
        throw new ForbiddenException(
          `Loan item ${outOfScope} does not belong to an organization/unit you manage, or is already approved.`,
        );
      }
      return dto.itemIds;
    }

    if (inScope.length === 0) {
      throw new ForbiddenException(
        "None of this loan's (still unapproved) items belong to an organization/unit you manage.",
      );
    }
    return inScope.map((i) => i.id);
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
      await this.assertItemsWithinActorScope(resolvedItems, user.id);
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
          data: {
            loanId: loan.id,
            inventoryItemId: item.id,
            // Fast-path approved loans (administer/manage without
            // forceRequested) must stamp every item as approved too, or the
            // per-item approval invariant (status===approved <=> every item
            // approved) would be violated from the moment of creation.
            ...(status === LoanStatus.approved
              ? { approvedAt: new Date(), approvedByUserId: user.id }
              : {}),
          },
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
      const scopedUserIds =
        await this.groups.getUserIdsWithLoanScopeForItems(resolvedItems);
      await this.email.notifyEvent(
        'loan.requested',
        'Neue Ausleihe wartet auf Genehmigung',
        `Eine neue Ausleihe für "${dto.borrowerName ?? dto.borrowerPersonId}" mit ${resolvedItems.length} Objekt(en) wartet auf Genehmigung.`,
        (r) =>
          r.permissions.has(PERMISSIONS.LOANS_ADMINISTER) ||
          scopedUserIds.has(r.id),
      );
    }

    return createdLoan;
  }

  async update(loanId: string, dto: UpdateLoanDto, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    if (loan.status === LoanStatus.completed) {
      throw new BadRequestException('Completed loans can no longer be edited.');
    }
    this.assertCanEditLoan(loan, user);

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
      // No org/unit scope check on additions here (unlike create()'s
      // manage-tier fast path): the per-item approval step re-validates
      // scope before anything can move forward, so an unrestricted add is
      // safe - and matches assertCanEditLoan's unconditional manage rights.
    }

    // Editing a not-yet-issued loan invalidates any approval progress: every
    // item goes back to unapproved, and a loan that was already fully
    // approved regresses to "requested". An already-issued loan is untouched
    // (forcing re-approval after physical hand-out would break the return
    // flow, and doesn't make practical sense).
    const resetsApproval = loan.status !== LoanStatus.issued;
    const regressesFromApproved =
      resetsApproval && loan.status === LoanStatus.approved;

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const li of toRemove) {
        if (loan.status === LoanStatus.issued && !li.returnedAt) {
          await tx.inventoryItem.update({
            where: { id: li.inventoryItemId },
            data: { status: InventoryStatus.available },
          });
          await tx.stockMovement.create({
            data: {
              inventoryItemId: li.inventoryItemId,
              loanItemId: li.id,
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
              loanItemId: created.id,
              type: StockMovementType.status_change,
              oldStatus: item.status,
              newStatus: InventoryStatus.borrowed,
              userId: user.id,
              note: `Zu laufender Ausleihe ${loanId} hinzugefügt`,
            },
          });
        }
      }

      if (resetsApproval) {
        await tx.loanItem.updateMany({
          where: { loanId },
          data: { approvedAt: null, approvedByUserId: null },
        });
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
          status: regressesFromApproved ? LoanStatus.requested : undefined,
        },
      });

      await this.audit.log(
        {
          entityType: 'Loan',
          entityId: loanId,
          action: 'update',
          summary: regressesFromApproved
            ? `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" bearbeitet (Status auf "beantragt" zurückgesetzt)`
            : `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" bearbeitet`,
          userId: user.id,
        },
        tx,
      );

      return tx.loan.findUniqueOrThrow({
        where: { id: loanId },
        include: LOAN_INCLUDE,
      });
    });

    if (regressesFromApproved) {
      const scopedUserIds = await this.groups.getUserIdsWithLoanScopeForItems(
        updated.items.map((i) => i.inventoryItem),
      );
      await this.email.notifyEvent(
        'loan.requested',
        'Ausleihe wurde bearbeitet und muss erneut genehmigt werden',
        `Die Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" wurde bearbeitet und muss erneut genehmigt werden.`,
        (r) =>
          r.permissions.has(PERMISSIONS.LOANS_ADMINISTER) ||
          scopedUserIds.has(r.id),
      );
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // Status workflow: requested -> approved -> issued -> completed
  // -------------------------------------------------------------------------

  /**
   * Approves specific loan items (or, without `itemIds`, every currently
   * unapproved item the actor is authorized for). A loan only becomes
   * "approved" once every one of its items has been approved - it may take
   * several calls by different org/unit-scoped approvers to get there.
   */
  async approve(loanId: string, dto: ApproveLoanDto, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    if (loan.status !== LoanStatus.requested) {
      throw new BadRequestException(
        `Only requested loans can be approved (current status: ${loan.status}).`,
      );
    }

    const itemIdsToApprove = await this.resolveApprovableItems(loan, dto, user);

    let fullyApproved = false;
    await this.prisma.$transaction(async (tx) => {
      if (itemIdsToApprove.length) {
        await tx.loanItem.updateMany({
          where: { id: { in: itemIdsToApprove } },
          data: { approvedAt: new Date(), approvedByUserId: user.id },
        });
      }

      const stillUnapproved = await tx.loanItem.count({
        where: { loanId, approvedAt: null },
      });
      fullyApproved = stillUnapproved === 0;

      if (fullyApproved) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: LoanStatus.approved },
        });
      }

      await this.audit.log(
        {
          entityType: 'Loan',
          entityId: loanId,
          action: 'update',
          summary: fullyApproved
            ? `Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" vollständig genehmigt`
            : `${itemIdsToApprove.length}/${loan.items.length} Objekt(e) der Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" genehmigt`,
          userId: user.id,
        },
        tx,
      );
    });

    const updated = await this.findOne(loanId);
    if (fullyApproved) {
      const scopedUserIds = await this.groups.getUserIdsWithLoanScopeForItems(
        updated.items.map((i) => i.inventoryItem),
      );
      await this.email.notifyEvent(
        'loan.approved',
        'Ausleihe genehmigt',
        `Die Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" wurde genehmigt.`,
        (r) =>
          r.permissions.has(PERMISSIONS.LOANS_ADMINISTER) ||
          scopedUserIds.has(r.id),
      );
    }
    return updated;
  }

  /** The physical hand-out step ("Ausgabe-Prozess"): captures condition, flips items to borrowed. */
  async issue(loanId: string, dto: IssueLoanDto, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    if (loan.status !== LoanStatus.approved) {
      throw new BadRequestException(
        `Only approved loans can be issued (current status: ${loan.status}).`,
      );
    }
    this.assertCanIssue(user);

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
            loanItemId: loanItem.id,
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

    const scopedUserIds = await this.groups.getUserIdsWithLoanScopeForItems(
      loan.items.map((i) => i.inventoryItem),
    );
    await this.email.notifyEvent(
      'loan.issued',
      'Ausleihe ausgegeben',
      `Die Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" wurde ausgegeben.`,
      (r) =>
        r.permissions.has(PERMISSIONS.LOANS_ADMINISTER) ||
        scopedUserIds.has(r.id),
    );

    return this.findOne(loanId);
  }

  async resetStatus(loanId: string, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    await this.assertCanResetStatus(loan, user);
    if (loan.status === LoanStatus.requested) {
      throw new BadRequestException('Loan is already in "requested" status.');
    }

    await this.prisma.$transaction([
      this.prisma.loan.update({
        where: { id: loanId },
        data: { status: LoanStatus.requested },
      }),
      this.prisma.loanItem.updateMany({
        where: { loanId },
        data: { approvedAt: null, approvedByUserId: null },
      }),
    ]);
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
    this.assertCanReturnItems(user);

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
            loanItemId: loanItem.id,
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
      const scopedUserIds = await this.groups.getUserIdsWithLoanScopeForItems(
        loan.items.map((i) => i.inventoryItem),
      );
      await this.email.notifyEvent(
        'loan.returned',
        'Ausleihe vollständig zurückgegeben',
        `Die Ausleihe für "${loan.borrowerName ?? loan.borrowerPersonId}" wurde vollständig zurückgegeben.`,
        (r) =>
          r.permissions.has(PERMISSIONS.LOANS_ADMINISTER) ||
          scopedUserIds.has(r.id),
      );
    }

    return this.findOne(loanId);
  }
}
