import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { ChurchToolsService } from './churchtools/churchtools.service';
import { WebauthnService } from './webauthn/webauthn.service';
import { PrismaService } from '../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../notifications/email.service';

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
    passwordResetToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let config: { get: jest.Mock };
  let users: { resetPassword: jest.Mock };
  let email: { isConfigured: jest.Mock; sendPasswordResetEmail: jest.Mock };

  const CONFIG_VALUES: Record<string, string> = {
    'jwt.accessSecret': 'access-secret',
    'jwt.accessExpiresIn': '15m',
    'jwt.refreshSecret': 'refresh-secret',
    'jwt.refreshExpiresIn': '30d',
    frontendUrl: 'https://inventar.example.com',
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
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = { get: jest.fn((key: string) => CONFIG_VALUES[key]) };
    users = { resetPassword: jest.fn().mockResolvedValue(undefined) };
    email = {
      isConfigured: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      {} as ChurchToolsService,
      {} as WebauthnService,
      {
        syncUserRoles: jest.fn().mockResolvedValue(undefined),
      } as unknown as GroupsService,
      users as unknown as UsersService,
      email as unknown as EmailService,
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

  describe('isPasswordResetAvailable', () => {
    it('reflects EmailService.isConfigured', async () => {
      email.isConfigured.mockResolvedValue(true);
      await expect(service.isPasswordResetAvailable()).resolves.toBe(true);

      email.isConfigured.mockResolvedValue(false);
      await expect(service.isPasswordResetAvailable()).resolves.toBe(false);
    });
  });

  describe('requestPasswordReset', () => {
    it('is a no-op when email is not configured', async () => {
      email.isConfigured.mockResolvedValue(false);
      await service.requestPasswordReset('user@example.com');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('is a no-op for an unknown or inactive user (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.requestPasswordReset('nobody@example.com');
      expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        isActive: false,
        deletedAt: null,
      });
      await service.requestPasswordReset('user@example.com');
      expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates a token and emails a reset link built from the configured frontend URL', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        isActive: true,
        deletedAt: null,
      });

      await service.requestPasswordReset('user@example.com');

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            expiresAt: expect.any(Date),
          }),
        }),
      );
      expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringMatching(
          /^https:\/\/inventar\.example\.com\/reset-password\?token=/,
        ),
      );
    });
  });

  describe('resetPasswordWithToken', () => {
    it('rejects a mismatched confirmation without consuming the token', async () => {
      await expect(
        service.resetPasswordWithToken('raw-token', 'passwordA', 'passwordB'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPasswordWithToken('raw-token', 'password1', 'password1'),
      ).rejects.toThrow(BadRequestException);
      expect(users.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects and deletes an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPasswordWithToken('raw-token', 'password1', 'password1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
      });
      expect(users.resetPassword).not.toHaveBeenCalled();
    });

    it('consumes a valid token and delegates the password change to UsersService', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.resetPasswordWithToken(
        'raw-token',
        'newPassword1',
        'newPassword1',
      );

      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
      });
      expect(users.resetPassword).toHaveBeenCalledWith('user-1', {
        newPassword: 'newPassword1',
      });
    });
  });
});
