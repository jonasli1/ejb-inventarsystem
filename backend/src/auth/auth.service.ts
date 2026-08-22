import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, GroupSource, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';
import {
  ChurchToolsService,
  ChurchToolsProfile,
} from './churchtools/churchtools.service';
import { WebauthnService } from './webauthn/webauthn.service';
import type { TokenResponseDto } from './dto/token-response.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly churchTools: ChurchToolsService,
    private readonly webauthn: WebauthnService,
    private readonly groups: GroupsService,
  ) {}

  // ---------------------------------------------------------------------
  // Local login
  // ---------------------------------------------------------------------

  async validateLocalUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { authIdentities: true },
    });

    const identity = user?.authIdentities.find(
      (i) => i.provider === AuthProvider.local,
    );

    if (!user || !user.isActive || user.deletedAt || !identity?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const valid = await argon2.verify(identity.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return user;
  }

  /** Self-service password change: requires knowing the current password. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (dto.newPassword !== dto.newPasswordConfirmation) {
      throw new BadRequestException(
        'The new password and its confirmation do not match.',
      );
    }

    const identity = await this.prisma.authIdentity.findFirst({
      where: { userId, provider: AuthProvider.local },
    });
    if (!identity?.passwordHash) {
      throw new BadRequestException(
        'This account has no local password set. Use "reset password" (admin) or set one via account settings first.',
      );
    }

    const valid = await argon2.verify(
      identity.passwordHash,
      dto.currentPassword,
    );
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.authIdentity.update({
      where: { id: identity.id },
      data: { passwordHash },
    });

    // Revoke other sessions; the caller's current tokens keep working until
    // they naturally expire/rotate, but stolen/old refresh tokens die here.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async login(user: User, deviceLabel?: string): Promise<TokenResponseDto> {
    return this.issueTokens(user, deviceLabel);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        authIdentities: {
          select: { provider: true, createdAt: true, deviceLabel: true },
        },
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
        userGroups: { include: { group: true } },
      },
    });

    const permissions = new Set<string>();
    const roles = user.userRoles.map((ur) => {
      for (const rp of ur.role.rolePermissions)
        permissions.add(rp.permission.key);
      return { id: ur.role.id, name: ur.role.name };
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isActive: user.isActive,
      createdAt: user.createdAt,
      authMethods: user.authIdentities.map((i) => i.provider),
      roles,
      permissions: Array.from(permissions),
      groups: user.userGroups.map((ug) => ({
        id: ug.group.id,
        name: ug.group.name,
        source: ug.source,
      })),
    };
  }

  // ---------------------------------------------------------------------
  // Token issuance / refresh / revocation
  // ---------------------------------------------------------------------

  private async issueTokens(
    user: User,
    deviceLabel?: string,
  ): Promise<TokenResponseDto> {
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn')!;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: accessExpiresIn as unknown as number,
      },
    );

    const rawRefreshToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(rawRefreshToken);
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;
    const expiresAt = new Date(
      Date.now() + this.parseDurationMs(refreshExpiresIn),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        deviceLabel,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.parseDurationMs(accessExpiresIn) / 1000,
    };
  }

  async refreshTokens(
    rawToken: string,
    deviceLabel?: string,
  ): Promise<TokenResponseDto> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !existing ||
      existing.revokedAt ||
      existing.expiresAt.getTime() < Date.now() ||
      !existing.user.isActive ||
      existing.user.deletedAt
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokens = await this.issueTokens(
      existing.user,
      deviceLabel ?? existing.deviceLabel ?? undefined,
    );

    const newTokenHash = this.hashToken(tokens.refreshToken);
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedBy: newTokenHash },
    });

    return tokens;
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
    if (!match) {
      const asNumber = Number(duration);
      return Number.isFinite(asNumber) ? asNumber : 15 * 60 * 1000;
    }
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * unitMs[unit];
  }

  // ---------------------------------------------------------------------
  // ChurchTools OAuth2 (PKCE) + group sync
  // ---------------------------------------------------------------------

  getChurchToolsAuthorizationUrl() {
    return this.churchTools.buildAuthorizationUrl();
  }

  async loginWithChurchTools(
    code: string,
    state: string,
  ): Promise<TokenResponseDto> {
    const profile = await this.churchTools.handleCallback(code, state);
    const user = await this.upsertChurchToolsUser(profile);
    await this.syncChurchToolsGroups(user.id, profile.groups);
    await this.groups.syncUserRoles(user.id);
    return this.issueTokens(user);
  }

  private async upsertChurchToolsUser(
    profile: ChurchToolsProfile,
  ): Promise<User> {
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.churchtools,
          providerSubject: profile.personId,
        },
      },
      include: { user: true },
    });

    if (existingIdentity) {
      return this.prisma.user.update({
        where: { id: existingIdentity.userId },
        data: {
          displayName: profile.displayName,
          ...(profile.email ? { email: profile.email } : {}),
        },
      });
    }

    if (!profile.email) {
      throw new BadRequestException(
        'ChurchTools profile did not provide an email address required for account linking.',
      );
    }

    const userByEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (userByEmail) {
      await this.prisma.authIdentity.create({
        data: {
          userId: userByEmail.id,
          provider: AuthProvider.churchtools,
          providerSubject: profile.personId,
        },
      });
      return userByEmail;
    }

    return this.prisma.user.create({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        authIdentities: {
          create: {
            provider: AuthProvider.churchtools,
            providerSubject: profile.personId,
          },
        },
      },
    });
  }

  private async syncChurchToolsGroups(
    userId: string,
    groups: { id: string; name: string }[],
  ): Promise<void> {
    const groupRecords = await Promise.all(
      groups.map((g) =>
        this.prisma.group.upsert({
          where: { externalRef: g.id },
          update: { name: g.name },
          create: { name: g.name, externalRef: g.id },
        }),
      ),
    );

    const incomingGroupIds = new Set(groupRecords.map((g) => g.id));

    const currentChurchToolsMemberships = await this.prisma.userGroup.findMany({
      where: { userId, source: GroupSource.churchtools },
    });

    const toRemove = currentChurchToolsMemberships.filter(
      (m) => !incomingGroupIds.has(m.groupId),
    );
    if (toRemove.length) {
      await this.prisma.userGroup.deleteMany({
        where: { id: { in: toRemove.map((m) => m.id) } },
      });
    }

    const existingGroupIds = new Set(
      currentChurchToolsMemberships.map((m) => m.groupId),
    );
    const toCreate = groupRecords.filter((g) => !existingGroupIds.has(g.id));
    if (toCreate.length) {
      await this.prisma.userGroup.createMany({
        data: toCreate.map((g) => ({
          userId,
          groupId: g.id,
          source: GroupSource.churchtools,
        })),
        skipDuplicates: true,
      });
    }
  }

  // ---------------------------------------------------------------------
  // Passkey / WebAuthn
  // ---------------------------------------------------------------------

  async createPasskeyRegistrationOptions(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const identities = await this.prisma.authIdentity.findMany({
      where: { userId, provider: AuthProvider.passkey },
    });

    const { challengeId, options } =
      await this.webauthn.createRegistrationOptions(
        user.id,
        user.email,
        user.displayName,
        identities.map((i) => i.credentialId!).filter(Boolean),
      );

    return { challengeId, options };
  }

  async verifyPasskeyRegistration(
    userId: string,
    challengeId: string,
    response: RegistrationResponseJSON,
    deviceLabel?: string,
  ): Promise<void> {
    const verification = await this.webauthn.verifyRegistration(
      challengeId,
      response,
    );

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException(
        'Passkey registration could not be verified.',
      );
    }

    const { credential } = verification.registrationInfo;

    const existing = await this.prisma.authIdentity.findUnique({
      where: { credentialId: credential.id },
    });
    if (existing) {
      throw new ConflictException('This passkey is already registered.');
    }

    await this.prisma.authIdentity.create({
      data: {
        userId,
        provider: AuthProvider.passkey,
        providerSubject: credential.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        signCount: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceLabel,
      },
    });
  }

  async createPasskeyLoginOptions(email?: string) {
    let allowCredentials: {
      id: string;
      transports?: AuthenticatorTransportFuture[];
    }[] = [];

    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: { authIdentities: true },
      });
      allowCredentials = (user?.authIdentities ?? [])
        .filter((i) => i.provider === AuthProvider.passkey && i.credentialId)
        .map((i) => ({
          id: i.credentialId!,
          transports: i.transports as AuthenticatorTransportFuture[],
        }));
    }

    return this.webauthn.createAuthenticationOptions(allowCredentials);
  }

  async verifyPasskeyLogin(
    challengeId: string,
    response: AuthenticationResponseJSON,
  ): Promise<TokenResponseDto> {
    const credentialId: string | undefined = response?.id;
    if (!credentialId) {
      throw new BadRequestException('Missing credential id in response.');
    }

    const identity = await this.prisma.authIdentity.findUnique({
      where: { credentialId },
      include: { user: true },
    });

    if (!identity || !identity.publicKey || identity.signCount === null) {
      throw new UnauthorizedException('Unknown passkey.');
    }

    const verification = await this.webauthn.verifyAuthentication(
      challengeId,
      response,
      {
        id: identity.credentialId!,
        publicKey: new Uint8Array(Buffer.from(identity.publicKey, 'base64url')),
        counter: Number(identity.signCount),
        transports: identity.transports as AuthenticatorTransportFuture[],
      },
    );

    if (!verification.verified) {
      throw new UnauthorizedException('Passkey verification failed.');
    }

    await this.prisma.authIdentity.update({
      where: { id: identity.id },
      data: { signCount: BigInt(verification.authenticationInfo.newCounter) },
    });

    if (!identity.user.isActive || identity.user.deletedAt) {
      throw new UnauthorizedException('User is inactive.');
    }

    return this.issueTokens(identity.user);
  }
}
