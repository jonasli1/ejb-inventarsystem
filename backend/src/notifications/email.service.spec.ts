import nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppBadRequestException } from '../common/exceptions/app.exception';
import { ConfigService } from '@nestjs/config';

jest.mock('nodemailer');

describe('EmailService', () => {
  let service: EmailService;
  let prisma: {
    emailConfig: { upsert: jest.Mock; findUnique: jest.Mock };
    user: { findMany: jest.Mock };
    appSettings: { findUnique: jest.Mock };
    notificationTemplate: { findUnique: jest.Mock };
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
      appSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ displayName: 'Inventarsystem', logoData: null, logoMimeType: null }),
      },
      notificationTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
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
        AppBadRequestException,
      );
    });

    it('sends via the configured transport when enabled', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      await service.sendTestEmail('test@example.com');
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.any(String),
          html: expect.stringContaining('Test-E-Mail'),
          text: expect.any(String),
        }),
      );
    });
  });

  describe('notifyEvent', () => {
    it('is a no-op for an unknown event key', async () => {
      await service.notifyEvent('unknown.event', {});
      expect(prisma.emailConfig.findUnique).not.toHaveBeenCalled();
    });

    it('is a no-op when email is disabled', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue({
        ...enabledRow,
        enabled: false,
      });
      await service.notifyEvent('loan.requested', {});
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sends to every eligible user by default (opt-out, not opt-in), rendering the default template', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      // The findMany `where` already restricts to active users holding a
      // required permission - the mock just returns who "matched" it.
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'no-row@example.com',
          displayName: 'Person Eins',
          notificationPreferences: [],
        },
        {
          email: 'explicitly-on@example.com',
          displayName: 'Person Zwei',
          notificationPreferences: [{ enabled: true }],
        },
      ]);

      await service.notifyEvent('loan.requested', {
        borrowerName: 'Max Mustermann',
        itemCount: '3',
      });

      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'no-row@example.com',
          html: expect.stringContaining('Max Mustermann'),
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'explicitly-on@example.com' }),
      );
    });

    it('renders an admin-customized template instead of the default when one exists', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      prisma.user.findMany.mockResolvedValue([
        { email: 'x@example.com', displayName: 'X', notificationPreferences: [] },
      ]);
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        subject: 'Benutzerdefinierter Betreff für {{borrowerName}}',
        bodyHtml: '<p>Individueller Text für {{recipientName}}</p>',
      });

      await service.notifyEvent('loan.requested', {
        borrowerName: 'Max Mustermann',
        itemCount: '1',
      });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Benutzerdefinierter Betreff für Max Mustermann',
          html: expect.stringContaining('Individueller Text für X'),
        }),
      );
    });

    it('HTML-escapes interpolated variables', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      prisma.user.findMany.mockResolvedValue([
        { email: 'x@example.com', displayName: 'X', notificationPreferences: [] },
      ]);

      await service.notifyEvent('loan.requested', {
        borrowerName: '<script>alert(1)</script>',
        itemCount: '1',
      });

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('skips a user who explicitly opted out', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'opted-out@example.com',
          displayName: 'Opt Out',
          notificationPreferences: [{ enabled: false }],
        },
        {
          email: 'default-on@example.com',
          displayName: 'Default On',
          notificationPreferences: [],
        },
      ]);

      await service.notifyEvent('loan.requested', {
        borrowerName: 'X',
        itemCount: '1',
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'default-on@example.com' }),
      );
    });

    it("queries only active users holding one of the event's required permissions", async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);

      await service.notifyEvent('backup.failed', { errorMessage: 'x' });

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
        { email: 'fails@example.com', displayName: 'Fails', notificationPreferences: [] },
        { email: 'ok@example.com', displayName: 'Ok', notificationPreferences: [] },
      ]);
      sendMail
        .mockRejectedValueOnce(new Error('SMTP down'))
        .mockResolvedValueOnce(undefined);

      await service.notifyEvent('loan.requested', {
        borrowerName: 'X',
        itemCount: '1',
      });

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
        'Jane Doe',
      );
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sends the reset link to the given address, addressed to the recipient by name', async () => {
      prisma.emailConfig.findUnique.mockResolvedValue(enabledRow);
      await service.sendPasswordResetEmail(
        'user@example.com',
        'https://app.example.com/reset-password?token=abc',
        'Jane Doe',
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          html: expect.stringContaining(
            'https://app.example.com/reset-password?token=abc',
          ),
          text: expect.stringContaining('Jane Doe'),
        }),
      );
    });
  });
});
