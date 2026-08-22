import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BlackoutPeriodsService } from './blackout-periods.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('BlackoutPeriodsService', () => {
  let service: BlackoutPeriodsService;
  let prisma: {
    loanBlackoutPeriod: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      loanBlackoutPeriod: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'period-1', ...data }),
          ),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new BlackoutPeriodsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('rejects an endDate before startDate', async () => {
      await expect(
        service.create(
          { startDate: '2026-08-10', endDate: '2026-08-01' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.loanBlackoutPeriod.create).not.toHaveBeenCalled();
    });

    it('creates a blackout period and logs it', async () => {
      const period = await service.create(
        { startDate: '2026-08-01', endDate: '2026-08-10', reason: 'Umbau' },
        'user-1',
      );
      expect(period.id).toBe('period-1');
      expect(prisma.loanBlackoutPeriod.create).toHaveBeenCalledWith({
        data: {
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-10'),
          reason: 'Umbau',
          createdById: 'user-1',
        },
      });
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the period does not exist', async () => {
      prisma.loanBlackoutPeriod.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.loanBlackoutPeriod.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing period', async () => {
      prisma.loanBlackoutPeriod.findUnique.mockResolvedValue({
        id: 'period-1',
      });
      await service.remove('period-1', 'user-1');
      expect(prisma.loanBlackoutPeriod.delete).toHaveBeenCalledWith({
        where: { id: 'period-1' },
      });
      expect(audit.log).toHaveBeenCalled();
    });
  });
});
