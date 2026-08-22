import { BadRequestException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';

jest.mock('nodemailer');

function rolesWithPermissions(...keys: string[]) {
  return [
    { role: { rolePermissions: keys.map((key) => ({ permission: { key } })) } },
  ];
}

describe('EmailService', () => {
  let service: EmailService;
  let prisma: {
    emailConfig: { upsert: jest.Mock; findUnique: jest.Mock };
    notificationPreference: { findMany: jest.Mock };
    userRole: { findMany: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let sendMail: jest.Mock;

  const enabledRow = {
    enabled: true,
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    username: 'user',
    passwordEnc: null,
    fromAddress: 'noreply@example.com',
    fromName: 'Inventarsystem',
  };

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    prisma = {
      emailConfig: {
        upsert: jest.fn().mockResolvedValue({
          id: 'singleton',
          enabled: false,
          passwordEnc: null,
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue('test-secret-key') };

    service = new EmailService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      config as unknown as ConfigService,
    );
  });

  describe('sendTestEmail', () => {
    it('refuses when email is not configured/enabled', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(null);
      await expect(service.sendTestEmail('test@example.com')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sends via the configured transport when enabled', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      await service.sendTestEmail('test@example.com');
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.any(String),
        }),
      );
    });
  });

  describe('notifyEvent', () => {
    it('is a no-op for an unknown event key', async () => {
      await service.notifyEvent('unknown.event', 'Subject', 'Body');
      expect(prisma.emailConfig.findUnique).not.toHaveBeenCalled();
    });

    it('is a no-op when email is disabled', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue({
        ...enabledRow,
        enabled: false,
      });
      await service.notifyEvent('loan.requested', 'Subject', 'Body');
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sends only to subscribers who still hold a required permission', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      prisma.notificationPreference.findMany.mockResolvedValue([
        {
          user: {
            id: 'user-1',
            email: 'permitted@example.com',
            isActive: true,
            deletedAt: null,
          },
        },
        {
          user: {
            id: 'user-2',
            email: 'stale@example.com',
            isActive: true,
            deletedAt: null,
          },
        },
        {
          user: {
            id: 'user-3',
            email: 'inactive@example.com',
            isActive: false,
            deletedAt: null,
          },
        },
      ]);
      prisma.userRole.findMany.mockImplementation(
        ({ where }: { where: { userId: string } }) => {
          if (where.userId === 'user-1')
            return Promise.resolve(rolesWithPermissions('loans.manage'));
          return Promise.resolve([]);
        },
      );

      await service.notifyEvent('loan.requested', 'Subject', 'Body');

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'permitted@example.com' }),
      );
    });

    it('does not let one recipient failure stop the others', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      prisma.notificationPreference.findMany.mockResolvedValue([
        {
          user: {
            id: 'user-1',
            email: 'fails@example.com',
            isActive: true,
            deletedAt: null,
          },
        },
        {
          user: {
            id: 'user-2',
            email: 'ok@example.com',
            isActive: true,
            deletedAt: null,
          },
        },
      ]);
      prisma.userRole.findMany.mockResolvedValue(
        rolesWithPermissions('loans.manage'),
      );
      sendMail
        .mockRejectedValueOnce(new Error('SMTP down'))
        .mockResolvedValueOnce(undefined);

      await service.notifyEvent('loan.requested', 'Subject', 'Body');

      expect(sendMail).toHaveBeenCalledTimes(2);
    });
  });
});
