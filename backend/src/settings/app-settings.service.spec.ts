import { BadRequestException } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AppSettingsService', () => {
  let service: AppSettingsService;
  let prisma: any;

  const singletonRow = {
    id: 'singleton',
    displayName: 'Inventarsystem',
    churchToolsEnabled: true,
    passkeyEnabled: true,
    logoData: null,
    logoMimeType: null,
  };

  beforeEach(() => {
    prisma = {
      appSettings: {
        upsert: jest.fn().mockResolvedValue(singletonRow),
        findUnique: jest.fn().mockResolvedValue(singletonRow),
        update: jest.fn().mockResolvedValue(singletonRow),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };

    service = new AppSettingsService(prisma, audit as unknown as AuditService);
  });

  describe('getConfig', () => {
    it('returns null logoDataUrl when no logo is set', async () => {
      const result = await service.getConfig();
      expect(result.logoDataUrl).toBeNull();
    });

    it('builds a data: URL from stored logo bytes and mime type', async () => {
      prisma.appSettings.upsert.mockResolvedValue({
        ...singletonRow,
        logoData: Buffer.from('fake-png-bytes'),
        logoMimeType: 'image/png',
      });
      const result = await service.getConfig();
      expect(result.logoDataUrl).toBe(
        `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`,
      );
    });
  });

  describe('isChurchToolsEnabled / isPasskeyEnabled', () => {
    it('default to true when no settings row exists yet', async () => {
      prisma.appSettings.findUnique.mockResolvedValue(null);
      await expect(service.isChurchToolsEnabled()).resolves.toBe(true);
      await expect(service.isPasskeyEnabled()).resolves.toBe(true);
    });

    it('reflect the stored flags', async () => {
      prisma.appSettings.findUnique.mockResolvedValue({
        churchToolsEnabled: false,
      });
      await expect(service.isChurchToolsEnabled()).resolves.toBe(false);
    });

    it('use a lean select (no logo bytes) to stay cheap on every login attempt', async () => {
      await service.isChurchToolsEnabled();
      expect(prisma.appSettings.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ select: { churchToolsEnabled: true } }),
      );
    });
  });

  describe('uploadLogo', () => {
    it('rejects a disallowed mime type', async () => {
      await expect(
        service.uploadLogo(Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a file over 2 MB', async () => {
      const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
      await expect(service.uploadLogo(oversized, 'image/png')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('stores the bytes and mime type for an accepted image', async () => {
      const bytes = Buffer.from('fake-svg');
      await service.uploadLogo(bytes, 'image/svg+xml', 'user-1');
      expect(prisma.appSettings.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: {
          logoData: Uint8Array.from(bytes),
          logoMimeType: 'image/svg+xml',
        },
      });
    });
  });

  describe('removeLogo', () => {
    it('clears the stored logo', async () => {
      await service.removeLogo('user-1');
      expect(prisma.appSettings.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: { logoData: null, logoMimeType: null },
      });
    });
  });
});
