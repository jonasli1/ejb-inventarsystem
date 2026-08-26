import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
import { LoanTemplatesService } from './loan-templates.service';
import { EmailService } from '../notifications/email.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateLoanDto } from './dto/create-loan.dto';

const createUser: AuthenticatedUser = {
  id: 'user-create',
  email: 'create@example.com',
  displayName: 'Create User',
  permissions: ['loans.create'],
};
const manageUser: AuthenticatedUser = {
  id: 'user-manage',
  email: 'manage@example.com',
  displayName: 'Manage User',
  permissions: ['loans.manage'],
};
const spendUser: AuthenticatedUser = {
  id: 'user-spend',
  email: 'spend@example.com',
  displayName: 'Spend User',
  permissions: ['loans.spend'],
};
const administerUser: AuthenticatedUser = {
  id: 'user-administer',
  email: 'administer@example.com',
  displayName: 'Administer User',
  permissions: ['loans.administer'],
};

// The default org-1/unit-1 scope granted to `manageUser`/`spendUser` in most tests.
const ORG_1_SCOPE = [{ organizationId: 'org-1', organizationUnitId: null }];

describe('LoansService', () => {
  let service: LoansService;
  let prisma: any;
  let groups: {
    getLoanScopeForUser: jest.Mock;
    getUserIdsWithLoanScopeForItems: jest.Mock;
  };
  let email: { notifyEvent: jest.Mock };

  beforeEach(() => {
    const tx = {
      loan: {
        create: jest.fn().mockResolvedValue({ id: 'loan-1' }),
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'loan-1', items: [] }),
      },
      loanItem: {
        create: jest.fn().mockResolvedValue({ id: 'loan-item-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryItem: { update: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      inventoryItem: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      loanItem: {
        findFirst: jest.fn().mockResolvedValue(null), // no scheduling conflict by default
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      loan: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      loanBlackoutPeriod: {
        findFirst: jest.fn().mockResolvedValue(null), // no blackout conflict by default
      },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function')
          return (arg as (tx: unknown) => unknown)(tx);
        return Promise.all(arg as Promise<unknown>[]);
      }),
      tx,
    };

    groups = {
      getLoanScopeForUser: jest.fn().mockResolvedValue(ORG_1_SCOPE),
      getUserIdsWithLoanScopeForItems: jest.fn().mockResolvedValue(new Set()),
    };

    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const loanTemplates = {
      createFromResolvedItems: jest.fn().mockResolvedValue(undefined),
    };
    email = { notifyEvent: jest.fn().mockResolvedValue(undefined) };
    service = new LoansService(
      prisma,
      audit as unknown as AuditService,
      groups as unknown as GroupsService,
      loanTemplates as unknown as LoanTemplatesService,
      email as unknown as EmailService,
    );
  });

  const dtoBase: CreateLoanDto = {
    items: [],
    borrowerName: 'Test Borrower',
    borrowerStreet: 'Teststraße 1',
    borrowerCity: '12345 Musterstadt',
    borrowerEmail: 'borrower@example.com',
    borrowerPhone: '0123456789',
    dueDate: '2026-08-15',
  };

  describe('create', () => {
    it('requires either borrowerPersonId or borrowerName', async () => {
      await expect(
        service.create(
          {
            ...dtoBase,
            borrowerName: undefined,
            items: [{ articleId: 'article-1', quantity: 1 }],
          },
          createUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects actors with none of the loan permissions', async () => {
      const noPermsUser: AuthenticatedUser = { ...createUser, permissions: [] };
      await expect(
        service.create(
          { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
          noPermsUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when an explicitly selected inventory item does not exist', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { ...dtoBase, items: [{ inventoryItemId: 'missing-item' }] },
          createUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when an explicitly selected inventory item has a non-bookable status', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'installed',
        inventoryNumber: 'INV-1',
      });
      await expect(
        service.create(
          { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
          createUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the item is already booked for an overlapping period', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
      });
      prisma.loanItem.findFirst.mockResolvedValue({
        id: 'conflicting-loan-item',
      });
      await expect(
        service.create(
          { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
          createUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when there are not enough available units for an article', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        { id: 'item-1', status: 'available' },
      ]);
      await expect(
        service.create(
          { ...dtoBase, items: [{ articleId: 'article-1', quantity: 3 }] },
          createUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a "requested" loan for a loans.create actor and does not touch inventory status', async () => {
      const availableItems = [
        {
          id: 'item-1',
          status: 'available',
          conditionPercent: null,
          ownerOrganizationId: 'org-9',
          ownerUnitId: 'unit-9',
        },
        {
          id: 'item-2',
          status: 'available',
          conditionPercent: null,
          ownerOrganizationId: 'org-9',
          ownerUnitId: 'unit-9',
        },
      ];
      prisma.inventoryItem.findMany.mockResolvedValue(availableItems);

      const result = await service.create(
        { ...dtoBase, items: [{ articleId: 'article-1', quantity: 2 }] },
        createUser,
      );

      expect(result).toEqual({ id: 'loan-1', items: [] });
      expect(prisma.tx.loanItem.create).toHaveBeenCalledTimes(2);
      expect(prisma.tx.inventoryItem.update).not.toHaveBeenCalled();
      expect(prisma.tx.loan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'requested' }),
        }),
      );
      // Not fast-path approved -> items must NOT be stamped as pre-approved.
      expect(prisma.tx.loanItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ approvedAt: expect.anything() }),
        }),
      );
    });

    it('auto-approves a loan created by a loans.administer actor, any organization, and pre-stamps items as approved', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
        ownerUnitId: 'unit-outside',
      });

      await service.create(
        { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
        administerUser,
      );

      expect(prisma.tx.loan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'approved' }),
        }),
      );
      expect(prisma.tx.loanItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvedAt: expect.any(Date),
            approvedByUserId: administerUser.id,
          }),
        }),
      );
    });

    it('honors forceRequested for a loans.administer actor', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
        ownerUnitId: 'unit-outside',
      });

      await service.create(
        {
          ...dtoBase,
          forceRequested: true,
          items: [{ inventoryItemId: 'item-1' }],
        },
        administerUser,
      );

      expect(prisma.tx.loan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'requested' }),
        }),
      );
    });

    it("auto-approves for loans.manage within the actor's own organization scope", async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-1',
        ownerUnitId: 'unit-1',
      });

      await service.create(
        { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
        manageUser,
      );

      expect(prisma.tx.loan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'approved' }),
        }),
      );
    });

    it('rejects loans.manage creating a loan with an item outside their organization/unit scope', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
        ownerUnitId: 'unit-outside',
      });

      await expect(
        service.create(
          { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
          manageUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('respects a unit-scoped (not whole-org) group scope', async () => {
      groups.getLoanScopeForUser.mockResolvedValue([
        { organizationId: 'org-1', organizationUnitId: 'unit-1' },
      ]);
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-1',
        ownerUnitId: 'unit-2', // same org, different unit -> out of scope
      });

      await expect(
        service.create(
          { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
          manageUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('checks only the checkout date (not unbounded future) when no due date is given', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
        ownerUnitId: 'unit-outside',
      });

      await service.create(
        {
          ...dtoBase,
          checkoutDate: '2026-07-21',
          dueDate: undefined,
          items: [{ inventoryItemId: 'item-1' }],
        } as unknown as CreateLoanDto,
        administerUser,
      );

      expect(prisma.loanBlackoutPeriod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            startDate: { lte: new Date('2026-07-21') },
            endDate: { gte: new Date('2026-07-21') },
          },
        }),
      );
    });

    it('checks the full [checkout, due] range when a due date is given', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
        ownerUnitId: 'unit-outside',
      });

      await service.create(
        {
          ...dtoBase,
          checkoutDate: '2026-07-21',
          dueDate: '2026-07-28',
          items: [{ inventoryItemId: 'item-1' }],
        },
        administerUser,
      );

      expect(prisma.loanBlackoutPeriod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            startDate: { lte: new Date('2026-07-28') },
            endDate: { gte: new Date('2026-07-21') },
          },
        }),
      );
    });

    it('rejects creating a loan that overlaps a blackout period, even for loans.administer', async () => {
      prisma.loanBlackoutPeriod.findFirst.mockResolvedValue({
        id: 'blackout-1',
        reason: 'Umbau',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-10'),
      });

      await expect(
        service.create(
          { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
          administerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('sends a "loan.requested" notification only when the loan lands in "requested" status, scoped by org', async () => {
      const availableItems = [
        {
          id: 'item-1',
          status: 'available',
          conditionPercent: null,
          ownerOrganizationId: 'org-9',
          ownerUnitId: 'unit-9',
        },
      ];
      prisma.inventoryItem.findMany.mockResolvedValue(availableItems);
      groups.getUserIdsWithLoanScopeForItems.mockResolvedValue(
        new Set(['scoped-approver']),
      );

      await service.create(
        { ...dtoBase, items: [{ articleId: 'article-1', quantity: 1 }] },
        createUser,
      );

      expect(email.notifyEvent).toHaveBeenCalledWith(
        'loan.requested',
        expect.any(String),
        expect.any(String),
        expect.any(Function),
      );
      const eligible = email.notifyEvent.mock.calls[0][3];
      expect(eligible({ id: 'scoped-approver', permissions: new Set() })).toBe(
        true,
      );
      expect(eligible({ id: 'someone-else', permissions: new Set() })).toBe(
        false,
      );
      expect(
        eligible({
          id: 'someone-else',
          permissions: new Set(['loans.administer']),
        }),
      ).toBe(true);
    });

    it('does not send a "loan.requested" notification when the loan is auto-approved', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
        ownerUnitId: 'unit-outside',
      });

      await service.create(
        { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
        administerUser,
      );

      expect(email.notifyEvent).not.toHaveBeenCalledWith(
        'loan.requested',
        expect.any(String),
        expect.any(String),
        expect.any(Function),
      );
    });
  });

  describe('findOne', () => {
    const loanRow = { id: 'loan-1', lentByUserId: createUser.id };

    it('returns the loan without an actor check when no actor is passed (internal call sites)', async () => {
      prisma.loan.findFirst.mockResolvedValue(loanRow);
      await expect(service.findOne('loan-1')).resolves.toEqual(loanRow);
    });

    it('throws NotFoundException when the loan does not exist', async () => {
      prisma.loan.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lets the creator view their own loan with only loans.create', async () => {
      prisma.loan.findFirst.mockResolvedValue(loanRow);
      await expect(service.findOne('loan-1', createUser)).resolves.toEqual(
        loanRow,
      );
    });

    it("rejects a loans.create-only actor viewing someone else's loan", async () => {
      prisma.loan.findFirst.mockResolvedValue(loanRow);
      const otherCreateUser: AuthenticatedUser = {
        ...createUser,
        id: 'someone-else',
      };
      await expect(service.findOne('loan-1', otherCreateUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets a loans.view holder view any loan', async () => {
      prisma.loan.findFirst.mockResolvedValue(loanRow);
      const viewUser: AuthenticatedUser = {
        id: 'someone-else',
        email: 'viewer@example.com',
        displayName: 'Viewer',
        permissions: ['loans.view'],
      };
      await expect(service.findOne('loan-1', viewUser)).resolves.toEqual(
        loanRow,
      );
    });

    it('lets manage/spend/administer holders view any loan', async () => {
      prisma.loan.findFirst.mockResolvedValue(loanRow);
      for (const user of [manageUser, spendUser, administerUser]) {
        await expect(service.findOne('loan-1', user)).resolves.toEqual(loanRow);
      }
    });
  });

  describe('status transitions', () => {
    const baseLoan = {
      id: 'loan-1',
      lentByUserId: 'user-creator',
      borrowerName: 'Test Borrower',
      status: 'requested',
      items: [
        {
          id: 'li-1',
          returnedAt: null,
          approvedAt: null,
          inventoryItemId: 'item-1',
          inventoryItem: {
            id: 'item-1',
            status: 'available',
            conditionPercent: 80,
            ownerOrganizationId: 'org-1',
            ownerUnitId: 'unit-1',
            article: { type: 'UNIQUE' },
          },
        },
      ],
    };

    describe('approve', () => {
      it('rejects a loan that is not "requested"', async () => {
        prisma.loan.findFirst.mockResolvedValue({
          ...baseLoan,
          status: 'approved',
        });
        await expect(
          service.approve('loan-1', {}, administerUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects an actor with neither loans.manage nor loans.administer', async () => {
        prisma.loan.findFirst.mockResolvedValue(baseLoan);
        await expect(service.approve('loan-1', {}, createUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('rejects loans.manage with zero in-scope unapproved items', async () => {
        prisma.loan.findFirst.mockResolvedValue(baseLoan);
        groups.getLoanScopeForUser.mockResolvedValue([
          { organizationId: 'org-other', organizationUnitId: null },
        ]);
        await expect(service.approve('loan-1', {}, manageUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('rejects loans.manage explicitly requesting an out-of-scope itemId', async () => {
        prisma.loan.findFirst.mockResolvedValue(baseLoan);
        groups.getLoanScopeForUser.mockResolvedValue([
          { organizationId: 'org-other', organizationUnitId: null },
        ]);
        await expect(
          service.approve('loan-1', { itemIds: ['li-1'] }, manageUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('fully approves a single-item loan for administer and sends a scoped "loan.approved" notification', async () => {
        prisma.loan.findFirst
          .mockResolvedValueOnce(baseLoan)
          .mockResolvedValueOnce({ ...baseLoan, status: 'approved' });
        prisma.tx.loanItem.count.mockResolvedValueOnce(0);

        const result = await service.approve('loan-1', {}, administerUser);

        expect(prisma.tx.loanItem.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['li-1'] } },
          data: {
            approvedAt: expect.any(Date),
            approvedByUserId: administerUser.id,
          },
        });
        expect(prisma.tx.loan.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { status: 'approved' } }),
        );
        expect(result.status).toBe('approved');
        expect(email.notifyEvent).toHaveBeenCalledWith(
          'loan.approved',
          expect.any(String),
          expect.any(String),
          expect.any(Function),
        );
      });

      it('partially approves a multi-org loan, leaving it "requested" until every item is approved', async () => {
        const multiOrgLoan = {
          ...baseLoan,
          items: [
            baseLoan.items[0],
            {
              id: 'li-2',
              returnedAt: null,
              approvedAt: null,
              inventoryItemId: 'item-2',
              inventoryItem: {
                id: 'item-2',
                status: 'available',
                conditionPercent: 100,
                ownerOrganizationId: 'org-2',
                ownerUnitId: 'unit-2',
                article: { type: 'UNIQUE' },
              },
            },
          ],
        };
        prisma.loan.findFirst
          .mockResolvedValueOnce(multiOrgLoan)
          .mockResolvedValueOnce(multiOrgLoan); // still requested afterwards
        // org-1 scoped actor: only li-1 gets approved, li-2 remains.
        prisma.tx.loanItem.count.mockResolvedValueOnce(1);

        const result = await service.approve('loan-1', {}, manageUser);

        expect(prisma.tx.loanItem.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['li-1'] } },
          data: {
            approvedAt: expect.any(Date),
            approvedByUserId: manageUser.id,
          },
        });
        expect(prisma.tx.loan.update).not.toHaveBeenCalled();
        expect(result.status).toBe('requested');
        expect(email.notifyEvent).not.toHaveBeenCalledWith(
          'loan.approved',
          expect.any(String),
          expect.any(String),
          expect.any(Function),
        );
      });

      it('respects unit-level scope: approves only the item in the scoped unit', async () => {
        const multiUnitLoan = {
          ...baseLoan,
          items: [
            baseLoan.items[0], // org-1/unit-1
            {
              id: 'li-2',
              returnedAt: null,
              approvedAt: null,
              inventoryItemId: 'item-2',
              inventoryItem: {
                id: 'item-2',
                status: 'available',
                conditionPercent: 100,
                ownerOrganizationId: 'org-1',
                ownerUnitId: 'unit-2', // same org, different unit
                article: { type: 'UNIQUE' },
              },
            },
          ],
        };
        prisma.loan.findFirst
          .mockResolvedValueOnce(multiUnitLoan)
          .mockResolvedValueOnce(multiUnitLoan);
        groups.getLoanScopeForUser.mockResolvedValue([
          { organizationId: 'org-1', organizationUnitId: 'unit-1' },
        ]);
        prisma.tx.loanItem.count.mockResolvedValueOnce(1);

        await service.approve('loan-1', {}, manageUser);

        expect(prisma.tx.loanItem.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['li-1'] } },
          data: expect.objectContaining({ approvedByUserId: manageUser.id }),
        });
      });
    });

    describe('issue', () => {
      it('issue() requires an approved loan', async () => {
        prisma.loan.findFirst.mockResolvedValue(baseLoan); // still "requested"
        await expect(
          service.issue('loan-1', {}, administerUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('flips items to borrowed and sends a scoped "loan.issued" notification for administer', async () => {
        const approvedLoan = { ...baseLoan, status: 'approved' };
        prisma.loan.findFirst
          .mockResolvedValueOnce(approvedLoan)
          .mockResolvedValueOnce({ ...approvedLoan, status: 'issued' });

        await service.issue('loan-1', {}, administerUser);

        expect(prisma.tx.inventoryItem.update).toHaveBeenCalledWith({
          where: { id: 'item-1' },
          data: { status: 'borrowed' },
        });
        expect(prisma.tx.loanItem.update).toHaveBeenCalledWith({
          where: { id: 'li-1' },
          data: { checkedOutCondition: 80 },
        });
        expect(prisma.tx.loan.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'issued' }),
          }),
        );
        expect(email.notifyEvent).toHaveBeenCalledWith(
          'loan.issued',
          expect.any(String),
          expect.any(String),
          expect.any(Function),
        );
      });

      it('allows loans.spend within scope to issue', async () => {
        const approvedLoan = { ...baseLoan, status: 'approved' };
        prisma.loan.findFirst
          .mockResolvedValueOnce(approvedLoan)
          .mockResolvedValueOnce({ ...approvedLoan, status: 'issued' });

        await service.issue('loan-1', {}, spendUser);

        expect(prisma.tx.loan.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'issued' }),
          }),
        );
      });

      it('allows loans.spend to issue items outside their group scope - issuing is unscoped', async () => {
        const approvedLoan = { ...baseLoan, status: 'approved' };
        prisma.loan.findFirst
          .mockResolvedValueOnce(approvedLoan)
          .mockResolvedValueOnce({ ...approvedLoan, status: 'issued' });
        groups.getLoanScopeForUser.mockResolvedValue([
          { organizationId: 'org-other', organizationUnitId: null },
        ]);

        await service.issue('loan-1', {}, spendUser);

        expect(prisma.tx.loan.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'issued' }),
          }),
        );
      });

      it('rejects loans.manage alone (no loans.spend) - manage no longer covers issuing', async () => {
        const approvedLoan = { ...baseLoan, status: 'approved' };
        prisma.loan.findFirst.mockResolvedValue(approvedLoan);
        await expect(service.issue('loan-1', {}, manageUser)).rejects.toThrow(
          ForbiddenException,
        );
      });
    });

    describe('resetStatus', () => {
      it('rejects a loan already in "requested"', async () => {
        prisma.loan.findFirst.mockResolvedValue(baseLoan);
        await expect(
          service.resetStatus('loan-1', administerUser),
        ).rejects.toThrow(BadRequestException);
      });

      it("resets status and clears every item's approval", async () => {
        prisma.loan.findFirst
          .mockResolvedValueOnce({ ...baseLoan, status: 'approved' })
          .mockResolvedValueOnce(baseLoan);

        await service.resetStatus('loan-1', administerUser);

        expect(prisma.loan.update).toHaveBeenCalledWith({
          where: { id: 'loan-1' },
          data: { status: 'requested' },
        });
        expect(prisma.loanItem.updateMany).toHaveBeenCalledWith({
          where: { loanId: 'loan-1' },
          data: { approvedAt: null, approvedByUserId: null },
        });
      });

      it("rejects loans.manage outside the loan's organization/unit scope", async () => {
        prisma.loan.findFirst.mockResolvedValue({
          ...baseLoan,
          status: 'approved',
        });
        groups.getLoanScopeForUser.mockResolvedValue([
          { organizationId: 'org-other', organizationUnitId: null },
        ]);
        await expect(service.resetStatus('loan-1', manageUser)).rejects.toThrow(
          ForbiddenException,
        );
      });
    });

    describe('returnLoan', () => {
      it('rejects a loan that is not "issued"', async () => {
        prisma.loan.findFirst.mockResolvedValue({
          ...baseLoan,
          status: 'approved',
        });
        await expect(
          service.returnLoan(
            'loan-1',
            { items: [{ loanItemId: 'li-1' }] },
            administerUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects loans.manage alone (no loans.spend) - manage no longer covers returning', async () => {
        prisma.loan.findFirst.mockResolvedValue({
          ...baseLoan,
          status: 'issued',
        });
        await expect(
          service.returnLoan(
            'loan-1',
            { items: [{ loanItemId: 'li-1' }] },
            manageUser,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('allows loans.spend to return items outside their group scope - returning is unscoped', async () => {
        const issuedLoan = { ...baseLoan, status: 'issued' };
        prisma.loan.findFirst
          .mockResolvedValueOnce(issuedLoan)
          .mockResolvedValueOnce({ ...issuedLoan, status: 'completed' });
        prisma.tx.loanItem.findMany.mockResolvedValueOnce([
          { returnedAt: new Date() },
        ]);
        groups.getLoanScopeForUser.mockResolvedValue([
          { organizationId: 'org-other', organizationUnitId: null },
        ]);

        await service.returnLoan(
          'loan-1',
          { items: [{ loanItemId: 'li-1' }] },
          spendUser,
        );

        expect(prisma.tx.loan.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'completed' }),
          }),
        );
      });

      it('allows loans.spend within scope to return', async () => {
        const issuedLoan = { ...baseLoan, status: 'issued' };
        prisma.loan.findFirst
          .mockResolvedValueOnce(issuedLoan)
          .mockResolvedValueOnce({ ...issuedLoan, status: 'completed' });
        prisma.tx.loanItem.findMany.mockResolvedValueOnce([
          { returnedAt: new Date() },
        ]);

        await service.returnLoan(
          'loan-1',
          { items: [{ loanItemId: 'li-1' }] },
          spendUser,
        );

        expect(prisma.tx.loan.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'completed' }),
          }),
        );
      });

      it('sends "loan.returned" (scoped) only once every item is back', async () => {
        const issuedLoan = { ...baseLoan, status: 'issued' };
        prisma.loan.findFirst
          .mockResolvedValueOnce(issuedLoan)
          .mockResolvedValueOnce({ ...issuedLoan, status: 'completed' });
        prisma.tx.loanItem.findMany.mockResolvedValueOnce([
          { returnedAt: new Date() },
        ]);

        await service.returnLoan(
          'loan-1',
          { items: [{ loanItemId: 'li-1' }] },
          administerUser,
        );

        expect(email.notifyEvent).toHaveBeenCalledWith(
          'loan.returned',
          expect.any(String),
          expect.any(String),
          expect.any(Function),
        );
      });

      it('does not send "loan.returned" for a partial return', async () => {
        const issuedLoan = { ...baseLoan, status: 'issued' };
        prisma.loan.findFirst
          .mockResolvedValueOnce(issuedLoan)
          .mockResolvedValueOnce(issuedLoan);
        prisma.tx.loanItem.findMany.mockResolvedValueOnce([
          { returnedAt: new Date() },
          { returnedAt: null },
        ]);

        await service.returnLoan(
          'loan-1',
          { items: [{ loanItemId: 'li-1' }] },
          administerUser,
        );

        expect(email.notifyEvent).not.toHaveBeenCalledWith(
          'loan.returned',
          expect.any(String),
          expect.any(String),
          expect.any(Function),
        );
      });
    });
  });

  describe('update', () => {
    const editableLoan = {
      id: 'loan-1',
      lentByUserId: 'user-creator',
      borrowerName: 'Test Borrower',
      checkoutDate: new Date('2026-08-01'),
      dueDate: new Date('2026-08-10'),
      status: 'requested',
      items: [
        {
          id: 'li-1',
          inventoryItemId: 'item-1',
          returnedAt: null,
          approvedAt: null,
          inventoryItem: {
            id: 'item-1',
            status: 'available',
            conditionPercent: 80,
            ownerOrganizationId: 'org-1',
            ownerUnitId: 'unit-1',
            article: { type: 'UNIQUE' },
          },
        },
      ],
    };

    it('blocks editing a completed loan', async () => {
      prisma.loan.findFirst.mockResolvedValue({
        ...editableLoan,
        status: 'completed',
      });
      await expect(
        service.update('loan-1', { notes: 'x' }, administerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows the creator to edit their own loan even with only loans.create', async () => {
      prisma.loan.findFirst.mockResolvedValue({
        ...editableLoan,
        lentByUserId: createUser.id,
      });
      await expect(
        service.update('loan-1', { notes: 'x' }, createUser),
      ).resolves.toBeDefined();
    });

    it('rejects a non-creator holding only loans.create', async () => {
      prisma.loan.findFirst.mockResolvedValue(editableLoan); // lentByUserId: 'user-creator'
      await expect(
        service.update('loan-1', { notes: 'x' }, createUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows loans.manage to edit any loan, unconditionally (no org/unit scope check)', async () => {
      prisma.loan.findFirst.mockResolvedValue({
        ...editableLoan,
        items: [
          {
            ...editableLoan.items[0],
            inventoryItem: {
              ...editableLoan.items[0].inventoryItem,
              ownerOrganizationId: 'org-outside',
              ownerUnitId: 'unit-outside',
            },
          },
        ],
      });
      await expect(
        service.update('loan-1', { notes: 'x' }, manageUser),
      ).resolves.toBeDefined();
    });

    it('resets an "approved" loan back to "requested", clears item approvals, and re-notifies', async () => {
      const approvedLoan = { ...editableLoan, status: 'approved' };
      prisma.loan.findFirst.mockResolvedValue(approvedLoan);
      prisma.tx.loan.findUniqueOrThrow.mockResolvedValueOnce({
        ...approvedLoan,
        status: 'requested',
      });

      await service.update('loan-1', { notes: 'geändert' }, administerUser);

      expect(prisma.tx.loanItem.updateMany).toHaveBeenCalledWith({
        where: { loanId: 'loan-1' },
        data: { approvedAt: null, approvedByUserId: null },
      });
      expect(prisma.tx.loan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'requested' }),
        }),
      );
      expect(email.notifyEvent).toHaveBeenCalledWith(
        'loan.requested',
        expect.any(String),
        expect.any(String),
        expect.any(Function),
      );
    });

    it('does not re-notify when editing a loan that was already "requested"', async () => {
      prisma.loan.findFirst.mockResolvedValue(editableLoan); // already requested
      prisma.tx.loan.findUniqueOrThrow.mockResolvedValueOnce(editableLoan);

      await service.update('loan-1', { notes: 'geändert' }, administerUser);

      expect(prisma.tx.loan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: undefined }),
        }),
      );
      expect(email.notifyEvent).not.toHaveBeenCalled();
    });

    it('does not reset status or clear approvals when editing an already-issued loan', async () => {
      const issuedLoan = {
        ...editableLoan,
        status: 'issued',
        items: [{ ...editableLoan.items[0], approvedAt: new Date() }],
      };
      prisma.loan.findFirst.mockResolvedValue(issuedLoan);
      prisma.tx.loan.findUniqueOrThrow.mockResolvedValueOnce(issuedLoan);

      await service.update('loan-1', { notes: 'geändert' }, administerUser);

      expect(prisma.tx.loanItem.updateMany).not.toHaveBeenCalled();
      expect(prisma.tx.loan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: undefined }),
        }),
      );
      expect(email.notifyEvent).not.toHaveBeenCalled();
    });
  });
});
