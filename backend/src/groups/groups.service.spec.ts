import { NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      group: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'group-1', name: 'Gruppe 1' }),
        create: jest.fn().mockResolvedValue({ id: 'group-1' }),
        update: jest.fn().mockResolvedValue({ id: 'group-1' }),
      },
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }),
      },
      organizationUnit: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'unit-1', organizationId: 'org-1' }),
      },
      groupOrganizationScope: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'scope-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notificationPreferences = {
      pruneForUser: jest.fn().mockResolvedValue(undefined),
    };

    service = new GroupsService(
      prisma,
      audit as unknown as AuditService,
      notificationPreferences as unknown as NotificationPreferencesService,
    );
  });

  describe('addOrganizationScope', () => {
    it('rejects an unknown organization', async () => {
      prisma.organization.findFirst.mockResolvedValue(null);
      await expect(
        service.addOrganizationScope('group-1', { organizationId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a unit that does not belong to the given organization', async () => {
      prisma.organizationUnit.findFirst.mockResolvedValue(null);
      await expect(
        service.addOrganizationScope('group-1', {
          organizationId: 'org-1',
          organizationUnitId: 'unit-elsewhere',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a whole-org scope (organizationUnitId omitted)', async () => {
      await service.addOrganizationScope('group-1', {
        organizationId: 'org-1',
      });
      expect(prisma.groupOrganizationScope.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            groupId: 'group-1',
            organizationId: 'org-1',
            organizationUnitId: undefined,
          },
        }),
      );
    });

    it('returns the existing scope instead of creating a duplicate', async () => {
      prisma.groupOrganizationScope.findFirst.mockResolvedValue({
        id: 'existing-scope',
      });
      prisma.groupOrganizationScope.findUniqueOrThrow.mockResolvedValue({
        id: 'existing-scope',
      });

      const result = await service.addOrganizationScope('group-1', {
        organizationId: 'org-1',
      });

      expect(prisma.groupOrganizationScope.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'existing-scope' });
    });
  });

  describe('removeOrganizationScope', () => {
    it('deletes scoped to both the scope id and the owning group', async () => {
      await service.removeOrganizationScope('group-1', 'scope-1');
      expect(prisma.groupOrganizationScope.deleteMany).toHaveBeenCalledWith({
        where: { id: 'scope-1', groupId: 'group-1' },
      });
    });
  });

  describe('getLoanScopeForUser', () => {
    it('deduplicates identical (org, unit) scope entries across multiple groups', async () => {
      prisma.groupOrganizationScope.findMany.mockResolvedValue([
        { organizationId: 'org-1', organizationUnitId: null },
        { organizationId: 'org-1', organizationUnitId: null },
        { organizationId: 'org-1', organizationUnitId: 'unit-1' },
      ]);

      const result = await service.getLoanScopeForUser('user-1');

      expect(result).toEqual([
        { organizationId: 'org-1', organizationUnitId: null },
        { organizationId: 'org-1', organizationUnitId: 'unit-1' },
      ]);
    });

    it('only considers scopes from non-deleted groups the user belongs to', async () => {
      await service.getLoanScopeForUser('user-1');
      expect(prisma.groupOrganizationScope.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            group: {
              deletedAt: null,
              userGroups: { some: { userId: 'user-1' } },
            },
          },
        }),
      );
    });
  });

  describe('getUserIdsWithLoanScopeForItems', () => {
    it('returns an empty set for an empty item list without querying', async () => {
      const result = await service.getUserIdsWithLoanScopeForItems([]);
      expect(result).toEqual(new Set());
      expect(prisma.groupOrganizationScope.findMany).not.toHaveBeenCalled();
    });

    it("matches a whole-org scope regardless of the item's unit", async () => {
      prisma.groupOrganizationScope.findMany.mockResolvedValue([
        {
          organizationId: 'org-1',
          organizationUnitId: null,
          group: { deletedAt: null, userGroups: [{ userId: 'approver-1' }] },
        },
      ]);

      const result = await service.getUserIdsWithLoanScopeForItems([
        { ownerOrganizationId: 'org-1', ownerUnitId: 'unit-99' },
      ]);

      expect(result).toEqual(new Set(['approver-1']));
    });

    it('does not match a unit-scoped group when the item is in a different unit', async () => {
      prisma.groupOrganizationScope.findMany.mockResolvedValue([
        {
          organizationId: 'org-1',
          organizationUnitId: 'unit-1',
          group: { deletedAt: null, userGroups: [{ userId: 'approver-1' }] },
        },
      ]);

      const result = await service.getUserIdsWithLoanScopeForItems([
        { ownerOrganizationId: 'org-1', ownerUnitId: 'unit-2' },
      ]);

      expect(result).toEqual(new Set());
    });

    it('excludes members of a soft-deleted group', async () => {
      prisma.groupOrganizationScope.findMany.mockResolvedValue([
        {
          organizationId: 'org-1',
          organizationUnitId: null,
          group: {
            deletedAt: new Date(),
            userGroups: [{ userId: 'stale-member' }],
          },
        },
      ]);

      const result = await service.getUserIdsWithLoanScopeForItems([
        { ownerOrganizationId: 'org-1', ownerUnitId: 'unit-1' },
      ]);

      expect(result).toEqual(new Set());
    });
  });
});
