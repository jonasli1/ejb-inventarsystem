import { ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: {
    role: {
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      update: jest.Mock;
    };
    rolePermission: { deleteMany: jest.Mock };
    userRole: { findMany: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let notificationPreferences: { pruneForUsers: jest.Mock };

  beforeEach(() => {
    prisma = {
      role: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      rolePermission: { deleteMany: jest.fn().mockResolvedValue({}) },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notificationPreferences = {
      pruneForUsers: jest.fn().mockResolvedValue(undefined),
    };
    service = new RolesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      notificationPreferences as unknown as NotificationPreferencesService,
    );
  });

  describe('remove', () => {
    it('refuses to delete the Admin role', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'role-1', name: 'Admin' });
      await expect(service.remove('role-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });

    it('deletes a non-Admin role', async () => {
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-1',
        name: 'Lagerwart',
      });
      await service.remove('role-1');
      expect(prisma.role.delete).toHaveBeenCalledWith({
        where: { id: 'role-1' },
      });
    });
  });

  describe('update', () => {
    it('refuses to rename the Admin role away from "Admin"', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'role-1', name: 'Admin' });
      await expect(
        service.update('role-1', { name: 'Superuser' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.role.update).not.toHaveBeenCalled();
    });

    it('allows updating the Admin role description without changing its name', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'role-1', name: 'Admin' });
      await service.update('role-1', { description: 'Updated' });
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: { description: 'Updated' },
      });
    });

    it('allows renaming a non-Admin role', async () => {
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-1',
        name: 'Lagerwart',
      });
      await service.update('role-1', { name: 'Lagerteam' });
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: { name: 'Lagerteam' },
      });
    });
  });

  describe('removePermission', () => {
    it('prunes notification preferences of every user holding the role', async () => {
      prisma.userRole.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      await service.removePermission('role-1', 'perm-1');
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1', permissionId: 'perm-1' },
      });
      expect(notificationPreferences.pruneForUsers).toHaveBeenCalledWith([
        'user-1',
        'user-2',
      ]);
    });
  });
});
