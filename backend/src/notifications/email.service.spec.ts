import { BadRequestException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';

jest.mock('nodemailer');

describe('EmailService', () => {
  let service: EmailService;
  let prisma: {
    emailConfig: { upsert: jest.Mock; findUnique: jest.Mock };
    user: { findMany: jest.Mock };
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
      user: { findMany: jest.fn().mockResolvedValue([]) },
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

    it('sends to every eligible user by default (opt-out, not opt-in)', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      // The findMany `where` already restricts to active users holding a
      // required permission - the mock just returns who "matched" it.
      prisma.user.findMany.mockResolvedValue([
        { email: 'no-row@example.com', notificationPreferences: [] },
        {
          email: 'explicitly-on@example.com',
          notificationPreferences: [{ enabled: true }],
        },
      ]);

      await service.notifyEvent('loan.requested', 'Subject', 'Body');

      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'no-row@example.com' }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'explicitly-on@example.com' }),
      );
    });

    it('skips a user who explicitly opted out', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'opted-out@example.com',
          notificationPreferences: [{ enabled: false }],
        },
        { email: 'default-on@example.com', notificationPreferences: [] },
      ]);

      await service.notifyEvent('loan.requested', 'Subject', 'Body');

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'default-on@example.com' }),
      );
    });

    it("queries only active users holding one of the event's required permissions", async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);

      await service.notifyEvent('backup.failed', 'Subject', 'Body');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            deletedAt: null,
            userRoles: {
              some: {
                role: {
                  rolePermissions: {
                    some: {
                      permission: { key: { in: ['settings.manage'] } },
                    },
                  },
                },
              },
            },
          }),
        }),
      );
    });

    it('does not let one recipient failure stop the others', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      prisma.user.findMany.mockResolvedValue([
        { email: 'fails@example.com', notificationPreferences: [] },
        { email: 'ok@example.com', notificationPreferences: [] },
      ]);
      sendMail
        .mockRejectedValueOnce(new Error('SMTP down'))
        .mockResolvedValueOnce(undefined);

      await service.notifyEvent('loan.requested', 'Subject', 'Body');

      expect(sendMail).toHaveBeenCalledTimes(2);
    });
  });

  describe('isConfigured', () => {
    it('is false when disabled or missing host/fromAddress', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(null);
      await expect(service.isConfigured()).resolves.toBe(false);

      prisma.emailConfig.findUnique.mockResolvedValue({
        ...enabledRow,
        enabled: false,
      });
      await expect(service.isConfigured()).resolves.toBe(false);
    });

    it('is true when enabled with host and fromAddress set', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      await expect(service.isConfigured()).resolves.toBe(true);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('is a no-op when email is not configured', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(null);
      await service.sendPasswordResetEmail(
        'user@example.com',
        'https://app.example.com/reset-password?token=abc',
      );
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sends the reset link to the given address', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      await service.sendPasswordResetEmail(
        'user@example.com',
        'https://app.example.com/reset-password?token=abc',
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          text: expect.stringContaining(
            'https://app.example.com/reset-password?token=abc',
          ),
        }),
      );
    });
  });
});
