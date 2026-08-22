import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GroupsService } from '../groups/groups.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    userGroup: { findUnique: jest.Mock; delete: jest.Mock };
    user: { findFirst: jest.Mock; update: jest.Mock };
    userRole: { findUnique: jest.Mock; deleteMany: jest.Mock };
  };
  let groups: { syncUserRoles: jest.Mock };
  let notificationPreferences: { pruneForUser: jest.Mock };

  beforeEach(() => {
    prisma = {
      userGroup: {
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      userRole: {
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };
    groups = { syncUserRoles: jest.fn().mockResolvedValue(undefined) };
    notificationPreferences = {
      pruneForUser: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      {
        log: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService,
      groups as unknown as GroupsService,
      notificationPreferences as unknown as NotificationPreferencesService,
    );
  });

  describe('remove', () => {
    it('refuses to delete your own account', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      await expect(service.remove('user-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('deletes another user', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });
      await service.remove('user-2', 'user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { deletedAt: expect.any(Date), isActive: false },
      });
    });

    it('allows deletion when no acting user id is provided (e.g. system call)', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });
      await service.remove('user-2');
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('removeRole', () => {
    it('prunes notification preferences after removing a manually-assigned role', async () => {
      prisma.userRole.findUnique.mockResolvedValue({
        userId: 'user-1',
        roleId: 'role-1',
        source: 'manual',
      });
      await service.removeRole('user-1', 'role-1');
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', roleId: 'role-1' },
      });
      expect(notificationPreferences.pruneForUser).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('refuses to remove a group-sourced role and does not prune', async () => {
      prisma.userRole.findUnique.mockResolvedValue({
        userId: 'user-1',
        roleId: 'role-1',
        source: 'group',
      });
      await expect(service.removeRole('user-1', 'role-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(notificationPreferences.pruneForUser).not.toHaveBeenCalled();
    });
  });

  describe('removeGroup', () => {
    it('does nothing when the membership does not exist', async () => {
      prisma.userGroup.findUnique.mockResolvedValue(null);
      await service.removeGroup('user-1', 'group-1');
      expect(prisma.userGroup.delete).not.toHaveBeenCalled();
    });

    it('refuses to remove a churchtools-sourced membership', async () => {
      prisma.userGroup.findUnique.mockResolvedValue({
        id: 'ug-1',
        source: 'churchtools',
      });
      await expect(service.removeGroup('user-1', 'group-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.userGroup.delete).not.toHaveBeenCalled();
    });

    it('removes a manually-assigned membership', async () => {
      prisma.userGroup.findUnique.mockResolvedValue({
        id: 'ug-1',
        source: 'manual',
      });
      await service.removeGroup('user-1', 'group-1');
      expect(prisma.userGroup.delete).toHaveBeenCalledWith({
        where: { id: 'ug-1' },
      });
    });
  });
});
