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
const administerUser: AuthenticatedUser = {
  id: 'user-administer',
  email: 'administer@example.com',
  displayName: 'Administer User',
  permissions: ['loans.administer'],
};

describe('LoansService', () => {
  let service: LoansService;
  let prisma: any;
  let groups: { getOrganizationIdsForUser: jest.Mock };
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
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
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
      },
      loan: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      loanBlackoutPeriod: {
        findFirst: jest.fn().mockResolvedValue(null), // no blackout conflict by default
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
      tx,
    };

    groups = {
      getOrganizationIdsForUser: jest.fn().mockResolvedValue(['org-1']),
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

  const dtoBase: CreateLoanDto = { items: [], borrowerName: 'Test Borrower' };

  describe('create', () => {
    it('requires either borrowerPersonId or borrowerName', async () => {
      await expect(
        service.create(
          { items: [{ articleId: 'article-1', quantity: 1 }] },
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
        },
        {
          id: 'item-2',
          status: 'available',
          conditionPercent: null,
          ownerOrganizationId: 'org-9',
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
    });

    it('auto-approves a loan created by a loans.administer actor, any organization', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
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
    });

    it('honors forceRequested for a loans.administer actor', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
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

    it("auto-approves for loans.manage within the actor's own organization", async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-1',
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

    it('rejects loans.manage creating a loan with an item outside their organization', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
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
      });

      await service.create(
        {
          ...dtoBase,
          checkoutDate: '2026-07-21',
          items: [{ inventoryItemId: 'item-1' }],
        },
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

    it('sends a "loan.requested" notification only when the loan lands in "requested" status', async () => {
      const availableItems = [
        {
          id: 'item-1',
          status: 'available',
          conditionPercent: null,
          ownerOrganizationId: 'org-9',
        },
      ];
      prisma.inventoryItem.findMany.mockResolvedValue(availableItems);

      await service.create(
        { ...dtoBase, items: [{ articleId: 'article-1', quantity: 1 }] },
        createUser,
      );

      expect(email.notifyEvent).toHaveBeenCalledWith(
        'loan.requested',
        expect.any(String),
        expect.any(String),
      );
    });

    it('does not send a "loan.requested" notification when the loan is auto-approved', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: 'available',
        inventoryNumber: 'INV-1',
        conditionPercent: null,
        ownerOrganizationId: 'org-outside',
      });

      await service.create(
        { ...dtoBase, items: [{ inventoryItemId: 'item-1' }] },
        administerUser,
      );

      expect(email.notifyEvent).not.toHaveBeenCalledWith(
        'loan.requested',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('status transitions', () => {
    const baseLoan = {
      id: 'loan-1',
      borrowerName: 'Test Borrower',
      status: 'requested',
      items: [
        {
          id: 'li-1',
          returnedAt: null,
          inventoryItemId: 'item-1',
          inventoryItem: {
            id: 'item-1',
            status: 'available',
            conditionPercent: 80,
            ownerOrganizationId: 'org-1',
            article: { type: 'UNIQUE' },
          },
        },
      ],
    };

    it('approve() rejects a loan that is not "requested"', async () => {
      prisma.loan.findFirst.mockResolvedValue({
        ...baseLoan,
        status: 'approved',
      });
      await expect(service.approve('loan-1', administerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approve() rejects loans.manage actors outside the item organization', async () => {
      prisma.loan.findFirst.mockResolvedValue(baseLoan);
      groups.getOrganizationIdsForUser.mockResolvedValue(['org-other']);
      await expect(service.approve('loan-1', manageUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('approve() succeeds for administer and sends a "loan.approved" notification', async () => {
      prisma.loan.findFirst
        .mockResolvedValueOnce(baseLoan)
        .mockResolvedValueOnce({ ...baseLoan, status: 'approved' });
      const result = await service.approve('loan-1', administerUser);
      expect(result.status).toBe('approved');
      expect(email.notifyEvent).toHaveBeenCalledWith(
        'loan.approved',
        expect.any(String),
        expect.any(String),
      );
    });

    it('issue() requires an approved loan and flips items to borrowed', async () => {
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
      );
    });

    it('issue() rejects a loan that is not approved', async () => {
      prisma.loan.findFirst.mockResolvedValue(baseLoan); // still "requested"
      await expect(service.issue('loan-1', {}, administerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('resetStatus() rejects a loan already in "requested"', async () => {
      prisma.loan.findFirst.mockResolvedValue(baseLoan);
      await expect(
        service.resetStatus('loan-1', administerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('returnLoan() rejects a loan that is not "issued"', async () => {
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

    it('returnLoan() sends "loan.returned" only once every item is back', async () => {
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
      );
    });

    it('returnLoan() does not send "loan.returned" for a partial return', async () => {
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
      );
    });
  });
});
