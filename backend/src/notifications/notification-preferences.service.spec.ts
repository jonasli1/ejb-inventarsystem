import { NotificationPreferencesService } from './notification-preferences.service';
import { PrismaService } from '../prisma/prisma.service';

function rolesWithPermissions(...keys: string[]) {
  return [
    {
      role: {
        rolePermissions: keys.map((key) => ({ permission: { key } })),
      },
    },
  ];
}

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let prisma: {
    userRole: { findMany: jest.Mock };
    notificationPreference: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
      notificationPreference: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };
    service = new NotificationPreferencesService(
      prisma as unknown as PrismaService,
    );
  });

  describe('listForUser', () => {
    it('only lists events the user is currently eligible for, with current status', async () => {
      prisma.userRole.findMany.mockResolvedValue(
        rolesWithPermissions('loans.manage'),
      );
      prisma.notificationPreference.findMany.mockResolvedValue([
        { eventKey: 'loan.requested' },
      ]);

      const result = await service.listForUser('user-1');

      expect(
        result.every((e) =>
          [
            'loan.requested',
            'loan.approved',
            'loan.issued',
            'loan.returned',
          ].includes(e.key),
        ),
      ).toBe(true);
      expect(result.some((e) => e.key === 'backup.failed')).toBe(false);
      expect(result.find((e) => e.key === 'loan.requested')?.enabled).toBe(
        true,
      );
      expect(result.find((e) => e.key === 'loan.approved')?.enabled).toBe(
        false,
      );
    });
  });

  describe('setPreference', () => {
    it('subscribes when the user holds a permission the event requires', async () => {
      prisma.userRole.findMany.mockResolvedValue(
        rolesWithPermissions('settings.manage'),
      );
      await service.setPreference('user-1', 'backup.failed', true);
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: {
          userId_eventKey: { userId: 'user-1', eventKey: 'backup.failed' },
        },
        update: {},
        create: { userId: 'user-1', eventKey: 'backup.failed' },
      });
    });

    it('silently ignores subscribing to an event the user is not eligible for', async () => {
      prisma.userRole.findMany.mockResolvedValue([]);
      await service.setPreference('user-1', 'backup.failed', true);
      expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    });

    it('unsubscribes regardless of current permissions', async () => {
      await service.setPreference('user-1', 'backup.failed', false);
      expect(prisma.notificationPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', eventKey: 'backup.failed' },
      });
    });
  });

  describe('pruneForUser', () => {
    it('removes preferences for events no longer covered by current permissions', async () => {
      prisma.userRole.findMany.mockResolvedValue(
        rolesWithPermissions('loans.manage'),
      );
      prisma.notificationPreference.findMany.mockResolvedValue([
        { id: 'pref-1', eventKey: 'loan.requested' },
        { id: 'pref-2', eventKey: 'backup.failed' },
      ]);

      await service.pruneForUser('user-1');

      expect(prisma.notificationPreference.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['pref-2'] } },
      });
    });

    it('does nothing when every preference is still covered', async () => {
      prisma.userRole.findMany.mockResolvedValue(
        rolesWithPermissions('loans.administer'),
      );
      prisma.notificationPreference.findMany.mockResolvedValue([
        { id: 'pref-1', eventKey: 'loan.issued' },
      ]);

      await service.pruneForUser('user-1');

      expect(prisma.notificationPreference.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('pruneForUsers', () => {
    it('prunes every given user', async () => {
      const spy = jest
        .spyOn(service, 'pruneForUser')
        .mockResolvedValue(undefined);
      await service.pruneForUsers(['user-1', 'user-2']);
      expect(spy).toHaveBeenCalledWith('user-1');
      expect(spy).toHaveBeenCalledWith('user-2');
    });
  });
});
