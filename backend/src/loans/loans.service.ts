import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InventoryItem,
  InventoryStatus,
  LoanSource,
  LoanStatus,
  Prisma,
  StockMovementType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';
import { GroupsService, type LoanScopeEntry } from '../groups/groups.service';
import { LoanTemplatesService } from './loan-templates.service';
import { EmailService } from '../notifications/email.service';
import { PERMISSIONS } from '../common/constants/permissions';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions/app.exception';
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
    orderBy: { sortOrder: 'asc' },
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
    private readonly config: ConfigService,
  ) {}

  /**
   * Shared variable set for every loan.* notification - built from a loan
   * already fetched with LOAN_INCLUDE (lentBy + items.inventoryItem.article)
   * so every call site can pass its already-loaded loan/updated record.
   */
  private buildLoanEmailVariables(
    loan: Prisma.LoanGetPayload<{ include: typeof LOAN_INCLUDE }>,
  ): Record<string, string> {
    const itemNames = loan.items.map((i) => i.inventoryItem.article.name);
    const formatDate = (d: Date | null) =>
      d ? new Intl.DateTimeFormat('de-DE').format(d) : '';

    return {
      borrowerName: loan.borrowerName ?? loan.borrowerPersonId ?? '',
      itemCount: String(loan.items.length),
      subject: loan.subject ?? '',
      borrowerStreet: loan.borrowerStreet ?? '',
      borrowerCity: loan.borrowerCity ?? '',
      borrowerEmail: loan.borrowerEmail ?? '',
      borrowerPhone: loan.borrowerPhone ?? '',
      itemList: itemNames.join(', '),
      itemListShort: itemNames.slice(0, 5).join(', '),
      createdBy: loan.lentBy?.displayName ?? '',
      startDate: formatDate(loan.checkoutDate),
      endDate: formatDate(loan.dueDate),
      loansUrl: `${this.config.get<string>('frontendUrl')}/loans`,
    };
  }

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
        subject: true,
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
    if (!loan) throw new AppNotFoundException('Ausleihe nicht gefunden.');
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
      PERMISSIONS.LOANS_READ,
      PERMISSIONS.LOANS_MANAGE,
      PERMISSIONS.LOANS_SPEND,
      PERMISSIONS.LOANS_ADMINISTER,
    ].some((p) => user.permissions.includes(p));
    if (!hasViewTier) {
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, diese Ausleihe einzusehen.',
        'MISSING_PERMISSION',
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
    throw new AppForbiddenException(
      'Sie haben keine Berechtigung, diese Ausleihe zu bearbeiten.',
      'MISSING_PERMISSION',
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
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, diese Ausleihe zu verwalten.',
        'MISSING_PERMISSION',
      );
    }
    const scope = await this.groups.getLoanScopeForUser(user.id);
    const outOfScope = loan.items.find(
      (i) => !this.isItemInScope(scope, i.inventoryItem),
    );
    if (outOfScope) {
      throw new AppForbiddenException(
        'Diese Ausleihe enthält Objekte einer Organisation/eines Bereichs, den Sie nicht verwalten.',
        'ITEM_OUT_OF_SCOPE',
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
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, diese Ausleihe auszugeben.',
        'MISSING_PERMISSION',
      );
    }
  }

  /** returnLoan(): same unscoped loans.spend/loans.administer check as issue(). */
  private assertCanReturnItems(user: AuthenticatedUser): void {
    if (
      !user.permissions.includes(PERMISSIONS.LOANS_SPEND) &&
      !user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER)
    ) {
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, Objekte dieser Ausleihe zurückzunehmen.',
        'MISSING_PERMISSION',
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
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, diese Ausleihe zu genehmigen.',
        'MISSING_PERMISSION',
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
        throw new AppForbiddenException(
          `Das Ausleih-Objekt ${outOfScope} gehört zu keiner von Ihnen verwalteten Organisation/keinem Bereich, oder ist bereits genehmigt.`,
          'ITEM_OUT_OF_SCOPE',
        );
      }
      return dto.itemIds;
    }

    if (inScope.length === 0) {
      throw new AppForbiddenException(
        'Keines der (noch unbestätigten) Objekte dieser Ausleihe gehört zu einer von Ihnen verwalteten Organisation/einem Bereich.',
        'ITEM_OUT_OF_SCOPE',
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
      throw new AppBadRequestException(
        `Inventarobjekt ${item.inventoryNumber ?? ''} hat den Status "${item.status}" und muss erst geändert werden, bevor es Teil einer Ausleihe sein kann.`,
        'ITEM_NOT_BOOKABLE',
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
      throw new AppBadRequestException(
        `Der gewünschte Zeitraum überschneidet sich mit einer Ausleihsperre (${conflict.startDate.toISOString().slice(0, 10)} – ${conflict.endDate.toISOString().slice(0, 10)}${conflict.reason ? `: ${conflict.reason}` : ''}), in der keine Ausleihen möglich sind.`,
        'BLACKOUT_CONFLICT',
      );
    }
  }

  /**
   * Resolves loan item specs (by inventoryItemId or by articleId+quantity) to
   * concrete inventory items, checking that each is bookable and free for the
   * requested [checkoutDate, dueDate] window. Works identically for immediate
   * and future-dated loans -- there is no separate "reserved" status, this
   * date-overlap check against other active loans' items is the only gate.
   *
   * Accessory items (InventoryItem.parentItemId set) are never picked to
   * fulfill an articleId+quantity request, and are auto-bundled alongside
   * every resolved main object's own accessories - they can only ever be
   * part of a loan together with their main object (see the trailing
   * consistency pass below), unless individually flagged
   * `separatelyLoanable`, in which case they may also be selected alone via
   * an explicit inventoryItemId.
   *
   * An articleId+quantity spec additionally requires the article's
   * `loanableByQuantity` flag - articles without it can only be checked out
   * by picking specific inventory items.
   */
  private async resolveCheckoutItems(
    items: CreateLoanItemDto[],
    checkoutDate: Date,
    dueDate: Date | null,
    excludeLoanId?: string,
    // update()'s edit flow resolves brand-new items in isolation from the
    // loan's already-kept items - an accessory being newly added whose main
    // object is already present (kept, not part of this call) must not be
    // rejected as "orphaned" just because its parent isn't part of *this*
    // resolution batch. Empty for create(), where every item is genuinely
    // new and must satisfy the trailing consistency check on its own.
    //
    // Also excluded from every candidate pool below (quantity picks and
    // auto-bundled accessories) - without this, a quantity spec's remainder
    // could legitimately re-pick a unit that's already kept elsewhere in the
    // same update (its InventoryItem.status is still "available" until
    // issued, so nothing else would flag it as taken), producing a second
    // LoanItem row for the same inventoryItemId. Deliberately NOT folded
    // into `usedIds` itself: an explicit inventoryItemId spec's id is always
    // a member of this set too (see update()'s pinnedIds), and that spec
    // must still resolve normally.
    extraSatisfiedParentIds: Set<string> = new Set(),
  ): Promise<InventoryItem[]> {
    const resolved: InventoryItem[] = [];
    const usedIds = new Set<string>();

    const addResolvedItem = async (item: InventoryItem): Promise<void> => {
      if (usedIds.has(item.id)) return;
      this.assertBookableStatus(item);
      if (
        await this.hasSchedulingConflict(
          item.id,
          checkoutDate,
          dueDate,
          excludeLoanId,
        )
      ) {
        throw new AppBadRequestException(
          `Inventarobjekt ${item.inventoryNumber ?? item.id} ist im gewünschten Zeitraum bereits gebucht.`,
          'ITEM_ALREADY_BOOKED',
        );
      }
      usedIds.add(item.id);
      resolved.push(item);
    };

    for (const spec of items) {
      if (spec.inventoryItemId) {
        const item = await this.prisma.inventoryItem.findFirst({
          where: { id: spec.inventoryItemId, deletedAt: null },
        });
        if (!item)
          throw new AppNotFoundException(
            `Inventarobjekt ${spec.inventoryItemId} nicht gefunden.`,
          );
        if (usedIds.has(item.id)) {
          throw new AppBadRequestException(
            `Inventarobjekt ${item.inventoryNumber ?? item.id} wurde doppelt ausgewählt.`,
            'ITEM_SELECTED_TWICE',
          );
        }
        await addResolvedItem(item);
        continue;
      }

      if (spec.articleId) {
        const article = await this.prisma.article.findFirst({
          where: { id: spec.articleId, deletedAt: null },
          select: { loanableByQuantity: true },
        });
        if (!article)
          throw new AppNotFoundException(
            `Artikel ${spec.articleId} nicht gefunden.`,
          );
        if (!article.loanableByQuantity) {
          throw new AppBadRequestException(
            `Artikel ${spec.articleId} ist nicht nach Anzahl ausleihbar - bitte konkrete Inventarobjekte auswählen.`,
            'ARTICLE_NOT_LOANABLE_BY_QUANTITY',
          );
        }
        const quantity = spec.quantity ?? 1;
        const candidates = await this.prisma.inventoryItem.findMany({
          where: {
            articleId: spec.articleId,
            deletedAt: null,
            status: { in: BOOKABLE_STATUSES },
            // Accessories are never auto-picked to fulfill a generic
            // quantity request - they only ever travel with their specific
            // main object, resolved via the bundling pass below.
            parentItemId: null,
            id: { notIn: [...usedIds, ...extraSatisfiedParentIds] },
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
          throw new AppBadRequestException(
            `Nicht genügend verfügbare Einheiten für Artikel ${spec.articleId} im gewünschten Zeitraum: angefragt ${quantity}, gefunden ${picked.length}.`,
            'NOT_ENOUGH_AVAILABLE_UNITS',
          );
        }
        for (const item of picked) {
          usedIds.add(item.id);
          resolved.push(item);
        }
        continue;
      }

      throw new AppBadRequestException(
        'Jedes Ausleih-Objekt benötigt entweder inventoryItemId oder articleId.',
        'ITEM_SPEC_INVALID',
      );
    }

    // Auto-bundle every resolved main object's accessories.
    for (const item of [...resolved]) {
      if (item.parentItemId) continue;
      const accessories = await this.prisma.inventoryItem.findMany({
        where: {
          parentItemId: item.id,
          deletedAt: null,
          id: { notIn: [...usedIds, ...extraSatisfiedParentIds] },
        },
      });
      for (const accessory of accessories) {
        await addResolvedItem(accessory);
      }
    }

    // An accessory may only be part of this checkout together with its main
    // object - reject any accessory that ended up here on its own (either
    // explicitly selected, or whose main object failed/was never requested)
    // - unless it's explicitly flagged as separately loanable.
    for (const item of resolved) {
      if (
        item.parentItemId &&
        !usedIds.has(item.parentItemId) &&
        !extraSatisfiedParentIds.has(item.parentItemId) &&
        !item.separatelyLoanable
      ) {
        throw new AppBadRequestException(
          `Inventarobjekt ${item.inventoryNumber ?? item.id} ist Zubehör eines anderen Objekts und kann nicht einzeln ausgeliehen werden.`,
          'ACCESSORY_CANNOT_BE_LOANED_ALONE',
        );
      }
    }

    return resolved;
  }

  // -------------------------------------------------------------------------
  // Create / update
  // -------------------------------------------------------------------------

  async create(dto: CreateLoanDto, user: AuthenticatedUser) {
    if (!dto.borrowerPersonId && !dto.borrowerName) {
      throw new AppBadRequestException(
        'Es muss entweder borrowerPersonId oder borrowerName angegeben werden.',
        'BORROWER_REQUIRED',
      );
    }

    const tier = this.resolveActorTier(user);
    if (!tier)
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, Ausleihen anzulegen.',
        'MISSING_PERMISSION',
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

    // Which item ids get stamped approved on creation - null covers "none".
    // loans.manage no longer hard-blocks out-of-scope items here (that
    // stays reserved for approve()'s explicit gate); it now auto-approves
    // whatever is in scope and leaves the rest for normal approval,
    // matching the same partial-approval invariant approve() already
    // maintains (status===approved <=> every item approved).
    let status: LoanStatus = LoanStatus.requested;
    let approvedItemIds: Set<string> | null = null;
    if (tier === 'administer') {
      status = dto.forceRequested ? LoanStatus.requested : LoanStatus.approved;
      if (status === LoanStatus.approved) {
        approvedItemIds = new Set(resolvedItems.map((i) => i.id));
      }
    } else if (tier === 'manage' && !dto.forceRequested) {
      const scope = await this.groups.getLoanScopeForUser(user.id);
      const inScopeItems = resolvedItems.filter((i) =>
        this.isItemInScope(scope, i),
      );
      approvedItemIds = new Set(inScopeItems.map((i) => i.id));
      status =
        inScopeItems.length === resolvedItems.length
          ? LoanStatus.approved
          : LoanStatus.requested;
    }
    // tier === 'create', or tier === 'manage' with forceRequested: always
    // requested, any organization, nothing pre-approved.

    const createdLoan = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          subject: dto.subject,
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

      for (const [index, item] of resolvedItems.entries()) {
        await tx.loanItem.create({
          data: {
            loanId: loan.id,
            inventoryItemId: item.id,
            sortOrder: index,
            ...(approvedItemIds?.has(item.id)
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
          summary: `Ausleihe "${dto.subject}" mit ${resolvedItems.length} Objekt(en) angelegt (Status: ${status})`,
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
        this.buildLoanEmailVariables(createdLoan),
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
      throw new AppBadRequestException(
        'Abgeschlossene Ausleihen können nicht mehr bearbeitet werden.',
        'LOAN_COMPLETED',
      );
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
    // Maps every final inventoryItemId (kept or newly added) to its display
    // position, derived from dto.items' array order - this is what actually
    // persists a manual reorder, and is also what `sortOrder` on newly
    // created LoanItems is set from below.
    const sortOrderById = new Map<string, number>();
    if (dto.items) {
      const items = dto.items;
      const currentIds = new Set(loan.items.map((i) => i.inventoryItemId));
      const pinnedIds = new Set(
        items.filter((i) => i.inventoryItemId).map((i) => i.inventoryItemId!),
      );

      // For each articleId+quantity spec, keep as many of the loan's current
      // (non-accessory, not otherwise claimed) items of that article as fit
      // the new quantity, and resolve the remainder as new items - this is
      // what lets a quantity row simply be edited from e.g. 3 to 5 instead
      // of requiring 2 more specific units to be hand-picked.
      const claimedCurrentIds = new Set<string>();
      interface Slot {
        dtoIndex: number;
        keptIds: string[];
        newSpec?: { articleId: string; quantity: number };
      }
      const slots: Slot[] = [];
      for (const [dtoIndex, spec] of items.entries()) {
        if (spec.inventoryItemId) {
          slots.push({ dtoIndex, keptIds: [] });
          continue;
        }
        if (spec.articleId) {
          const quantity = spec.quantity ?? 1;
          const candidates = loan.items.filter(
            (li) =>
              li.inventoryItem.articleId === spec.articleId &&
              li.inventoryItem.parentItemId === null &&
              !claimedCurrentIds.has(li.inventoryItemId) &&
              !pinnedIds.has(li.inventoryItemId),
          );
          const keep = candidates.slice(0, quantity);
          keep.forEach((li) => claimedCurrentIds.add(li.inventoryItemId));
          const remainder = quantity - keep.length;
          slots.push({
            dtoIndex,
            keptIds: keep.map((li) => li.inventoryItemId),
            newSpec:
              remainder > 0
                ? { articleId: spec.articleId, quantity: remainder }
                : undefined,
          });
          continue;
        }
        throw new AppBadRequestException(
          'Jedes Ausleih-Objekt benötigt entweder inventoryItemId oder articleId.',
          'ITEM_SPEC_INVALID',
        );
      }

      const finalKnownIds = new Set([...pinnedIds, ...claimedCurrentIds]);

      // Accessory consistency must hold for the *whole* resulting item set,
      // not just newly added items - otherwise a request could keep an
      // already-current accessory while dropping its main object and bypass
      // resolveCheckoutItems() entirely. Only explicitly-pinned items can
      // possibly be accessories here - quantity candidates are always
      // filtered to parentItemId: null above.
      const pinnedItems = await this.prisma.inventoryItem.findMany({
        where: { id: { in: [...pinnedIds] } },
      });
      const orphanedAccessory = pinnedItems.find(
        (i) =>
          i.parentItemId &&
          !i.separatelyLoanable &&
          !finalKnownIds.has(i.parentItemId),
      );
      if (orphanedAccessory) {
        throw new AppBadRequestException(
          `Inventarobjekt ${orphanedAccessory.inventoryNumber ?? orphanedAccessory.id} ist Zubehör eines anderen Objekts und kann nicht einzeln ausgeliehen werden.`,
          'ACCESSORY_CANNOT_BE_LOANED_ALONE',
        );
      }

      toRemove = loan.items.filter(
        (li) =>
          !pinnedIds.has(li.inventoryItemId) &&
          !claimedCurrentIds.has(li.inventoryItemId),
      );

      // Resolve every genuinely-new pick (explicit items not already in the
      // loan, plus quantity shortfalls) in one batch, in dto.items order,
      // tracking which slot and how many items each spec contributes so the
      // flat result can be sliced back apart afterwards.
      const resolveSpecs: CreateLoanItemDto[] = [];
      const resolveSlotIndices: number[] = [];
      const resolveCounts: number[] = [];
      slots.forEach((slot, slotIndex) => {
        if (slot.newSpec) {
          resolveSpecs.push(slot.newSpec);
          resolveSlotIndices.push(slotIndex);
          resolveCounts.push(slot.newSpec.quantity);
        } else if (slot.keptIds.length === 0) {
          // Explicit spec - only resolve if not already in the loan.
          const id = items[slot.dtoIndex].inventoryItemId!;
          if (!currentIds.has(id)) {
            resolveSpecs.push({ inventoryItemId: id });
            resolveSlotIndices.push(slotIndex);
            resolveCounts.push(1);
          }
        }
      });
      const resolvedNew = resolveSpecs.length
        ? await this.resolveCheckoutItems(
            resolveSpecs,
            checkoutDate,
            dueDate,
            loanId,
            finalKnownIds,
          )
        : [];
      // No org/unit scope check on additions here (unlike create()'s
      // manage-tier fast path): the per-item approval step re-validates
      // scope before anything can move forward, so an unrestricted add is
      // safe - and matches assertCanEditLoan's unconditional manage rights.

      // Slice the main (non-bundled) portion back out per slot, in order.
      let cursor = 0;
      const newIdsBySlot = new Map<number, string[]>();
      resolveSlotIndices.forEach((slotIndex, specIndex) => {
        const count = resolveCounts[specIndex];
        newIdsBySlot.set(
          slotIndex,
          resolvedNew.slice(cursor, cursor + count).map((item) => item.id),
        );
        cursor += count;
      });
      // Anything past the known per-slot counts is auto-bundled accessories
      // - appended at the end, since the user never explicitly ordered them.
      const bundledAccessories = resolvedNew.slice(cursor);

      let position = 0;
      slots.forEach((slot, slotIndex) => {
        if (slot.newSpec || slot.keptIds.length > 0) {
          for (const id of slot.keptIds) sortOrderById.set(id, position++);
          for (const id of newIdsBySlot.get(slotIndex) ?? [])
            sortOrderById.set(id, position++);
        } else {
          // Plain explicit spec (kept-current or newly resolved single item).
          const id = items[slot.dtoIndex].inventoryItemId!;
          sortOrderById.set(id, position++);
        }
      });
      for (const item of bundledAccessories) sortOrderById.set(item.id, position++);

      toAdd = resolvedNew;
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
          data: {
            loanId,
            inventoryItemId: item.id,
            sortOrder: sortOrderById.get(item.id) ?? 0,
          },
        });
        if (loan.status === LoanStatus.issued) {
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

      // Persist any reordering of items that were already in the loan
      // (newly added ones already got their sortOrder set at creation
      // above).
      if (dto.items) {
        const toRemoveIds = new Set(toRemove.map((li) => li.id));
        for (const li of loan.items) {
          if (toRemoveIds.has(li.id)) continue;
          const sortOrder = sortOrderById.get(li.inventoryItemId);
          if (sortOrder !== undefined && sortOrder !== li.sortOrder) {
            await tx.loanItem.update({
              where: { id: li.id },
              data: { sortOrder },
            });
          }
        }
      }

      await tx.loan.update({
        where: { id: loanId },
        data: {
          subject: dto.subject,
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
            ? `Ausleihe "${loan.subject}" bearbeitet (Status auf "beantragt" zurückgesetzt)`
            : `Ausleihe "${loan.subject}" bearbeitet`,
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
        this.buildLoanEmailVariables(updated),
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
      throw new AppBadRequestException(
        `Nur beantragte Ausleihen können genehmigt werden (aktueller Status: ${loan.status}).`,
        'INVALID_LOAN_STATUS',
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
            ? `Ausleihe "${loan.subject}" vollständig genehmigt`
            : `${itemIdsToApprove.length}/${loan.items.length} Objekt(e) der Ausleihe "${loan.subject}" genehmigt`,
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
        this.buildLoanEmailVariables(updated),
        (r) =>
          r.permissions.has(PERMISSIONS.LOANS_ADMINISTER) ||
          scopedUserIds.has(r.id),
      );
    }
    return updated;
  }

  /** The physical hand-out step ("Ausgabe-Prozess"): flips items to borrowed. */
  async issue(loanId: string, _dto: IssueLoanDto, user: AuthenticatedUser) {
    const loan = await this.findOne(loanId);
    if (loan.status !== LoanStatus.approved) {
      throw new AppBadRequestException(
        `Nur genehmigte Ausleihen können ausgegeben werden (aktueller Status: ${loan.status}).`,
        'INVALID_LOAN_STATUS',
      );
    }
    this.assertCanIssue(user);

    await this.prisma.$transaction(async (tx) => {
      for (const loanItem of loan.items) {
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
          summary: `Ausleihe "${loan.subject}" ausgegeben`,
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
      this.buildLoanEmailVariables(loan),
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
      throw new AppBadRequestException(
        'Die Ausleihe befindet sich bereits im Status "beantragt".',
        'INVALID_LOAN_STATUS',
      );
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
      summary: `Status der Ausleihe "${loan.subject}" auf "beantragt" zurückgesetzt`,
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
      throw new AppBadRequestException(
        `Nur ausgegebene Ausleihen können zurückgenommen werden (aktueller Status: ${loan.status}).`,
        'INVALID_LOAN_STATUS',
      );
    }
    this.assertCanReturnItems(user);

    const loanItemIds = new Set(loan.items.map((i) => i.id));
    for (const returnItem of dto.items) {
      if (!loanItemIds.has(returnItem.loanItemId)) {
        throw new AppBadRequestException(
          `Ausleih-Objekt ${returnItem.loanItemId} gehört nicht zur Ausleihe ${loanId}.`,
          'ITEM_NOT_IN_LOAN',
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

        await tx.loanItem.update({
          where: { id: loanItem.id },
          data: { returnedAt: new Date() },
        });

        await tx.inventoryItem.update({
          where: { id: loanItem.inventoryItemId },
          data: { status: newStatus },
        });

        await tx.stockMovement.create({
          data: {
            inventoryItemId: loanItem.inventoryItemId,
            loanItemId: loanItem.id,
            type: StockMovementType.status_change,
            oldStatus: loanItem.inventoryItem.status,
            newStatus,
            userId: user.id,
            note: `Zurückgegeben via Ausleihe ${loanId}`,
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
            ? `Ausleihe "${loan.subject}" vollständig zurückgegeben`
            : `Ausleihe "${loan.subject}" teilweise zurückgegeben`,
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
        this.buildLoanEmailVariables(loan),
        (r) =>
          r.permissions.has(PERMISSIONS.LOANS_ADMINISTER) ||
          scopedUserIds.has(r.id),
      );
    }

    return this.findOne(loanId);
  }

  /**
   * Hard delete: fully removes the loan (and its items) from the database,
   * not just a soft-delete. Gated by the dedicated loans.delete permission
   * (see permissions.guard usage in LoansController) since this is
   * irreversible and distinct from every other loan action.
   */
  async remove(loanId: string, user: AuthenticatedUser): Promise<void> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId },
      select: {
        id: true,
        status: true,
        subject: true,
        items: {
          where: { returnedAt: null },
          select: { id: true, inventoryItemId: true },
        },
      },
    });
    if (!loan) throw new AppNotFoundException('Ausleihe nicht gefunden.');

    await this.prisma.$transaction(async (tx) => {
      // Deleting an issued loan must not leave its still-borrowed items
      // stuck on `borrowed` forever - revert each to whatever status it
      // held right before this loan issued it (looked up from that
      // item's own status_change history), falling back to `available`
      // if no such movement is found.
      if (loan.status === LoanStatus.issued) {
        for (const item of loan.items) {
          const issueMovement = await tx.stockMovement.findFirst({
            where: {
              loanItemId: item.id,
              type: StockMovementType.status_change,
              newStatus: InventoryStatus.borrowed,
            },
            orderBy: { createdAt: 'desc' },
          });
          const revertStatus =
            issueMovement?.oldStatus ?? InventoryStatus.available;

          await tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: revertStatus },
          });

          await tx.stockMovement.create({
            data: {
              inventoryItemId: item.inventoryItemId,
              loanItemId: item.id,
              type: StockMovementType.status_change,
              oldStatus: InventoryStatus.borrowed,
              newStatus: revertStatus,
              userId: user.id,
              note: `Status zurückgesetzt (Ausleihe ${loanId} gelöscht)`,
            },
          });
        }
      }

      await this.audit.log(
        {
          entityType: 'Loan',
          entityId: loanId,
          action: 'delete',
          summary: `Ausleihe "${loan.subject}" gelöscht`,
          userId: user.id,
        },
        tx,
      );

      await tx.loan.delete({ where: { id: loanId } });
    });
  }
}
