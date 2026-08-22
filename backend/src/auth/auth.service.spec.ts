import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { ChurchToolsService } from './churchtools/churchtools.service';
import { WebauthnService } from './webauthn/webauthn.service';
import { PrismaService } from '../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let config: { get: jest.Mock };

  const CONFIG_VALUES: Record<string, string> = {
    'jwt.accessSecret': 'access-secret',
    'jwt.accessExpiresIn': '15m',
    'jwt.refreshSecret': 'refresh-secret',
    'jwt.refreshExpiresIn': '30d',
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = { get: jest.fn((key: string) => CONFIG_VALUES[key]) };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      {} as ChurchToolsService,
      {} as WebauthnService,
      {
        syncUserRoles: jest.fn().mockResolvedValue(undefined),
      } as unknown as GroupsService,
    );
  });

  describe('validateLocalUser', () => {
    it('throws when no user exists for the email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.validateLocalUser('nobody@example.com', 'pw'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the user has no local auth identity', async () => {
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        deletedAt: null,
        authIdentities: [{ provider: 'churchtools' }],
      });
      await expect(
        service.validateLocalUser('user@example.com', 'pw'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the user is inactive', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        isActive: false,
        deletedAt: null,
        authIdentities: [{ provider: 'local', passwordHash }],
      });
      await expect(
        service.validateLocalUser('user@example.com', 'correct-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws on an incorrect password', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        deletedAt: null,
        authIdentities: [{ provider: 'local', passwordHash }],
      });
      await expect(
        service.validateLocalUser('user@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns the user on a correct password', async () => {
      const passwordHash = await argon2.hash('correct-password');
      const user = {
        id: 'user-1',
        isActive: true,
        deletedAt: null,
        authIdentities: [{ provider: 'local', passwordHash }],
      };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.validateLocalUser(
        'user@example.com',
        'correct-password',
      );
      expect(result).toBe(user);
    });
  });

  describe('login / token issuance', () => {
    it('issues an access and refresh token and persists the refresh token hash', async () => {
      const user = { id: 'user-1', email: 'user@example.com' };

      const result = await service.login(user as never, 'test-agent');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(15 * 60);

      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            deviceLabel: 'test-agent',
          }),
        }),
      );
    });
  });

  describe('refreshTokens', () => {
    it('rejects an unknown refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refreshTokens('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a revoked refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', isActive: true, deletedAt: null },
      });
      await expect(service.refreshTokens('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
        user: { id: 'user-1', isActive: true, deletedAt: null },
      });
      await expect(service.refreshTokens('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotates a valid refresh token: revokes the old one and issues a new pair', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        deviceLabel: 'old-device',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          isActive: true,
          deletedAt: null,
        },
      });

      const result = await service.refreshTokens('valid-token');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the matching non-revoked refresh token', async () => {
      await service.logout('some-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
