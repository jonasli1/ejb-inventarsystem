import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuthProvider,
  GroupSource,
  ThemePreference,
  type User,
} from '../generated/prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../notifications/email.service';
import { AppSettingsService } from '../settings/app-settings.service';
import { AuditService } from '../audit/audit.service';
import { normalizeEmail } from '../common/utils/normalize-email';
import {
  AppBadRequestException,
  AppConflictException,
  AppUnauthorizedException,
} from '../common/exceptions/app.exception';
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

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

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
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly appSettings: AppSettingsService,
    private readonly audit: AuditService,
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
      await this.logAuthEvent('login_failed', email, `Fehlgeschlagene Anmeldung für "${email}"`);
      throw new AppUnauthorizedException(
        'E-Mail-Adresse oder Passwort ist falsch.',
        'INVALID_CREDENTIALS',
      );
    }

    const valid = await argon2.verify(identity.passwordHash, password);
    if (!valid) {
      await this.logAuthEvent(
        'login_failed',
        user.id,
        `Fehlgeschlagene Anmeldung für "${email}"`,
      );
      throw new AppUnauthorizedException(
        'E-Mail-Adresse oder Passwort ist falsch.',
        'INVALID_CREDENTIALS',
      );
    }

    return user;
  }

  /** Small helper so every login/logout/failure site logs consistently under the "auth" category. */
  private async logAuthEvent(
    action: 'login' | 'login_failed' | 'logout',
    entityId: string,
    summary: string,
    userId?: string,
  ): Promise<void> {
    await this.audit.log({
      entityType: 'User',
      entityId,
      action,
      category: 'auth',
      summary,
      userId: userId ?? (action === 'login_failed' ? undefined : entityId),
    });
  }

  /** Self-service password change: requires knowing the current password. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (dto.newPassword !== dto.newPasswordConfirmation) {
      throw new AppBadRequestException(
        'Das neue Passwort und die Bestätigung stimmen nicht überein.',
        'PASSWORD_MISMATCH',
      );
    }

    const identity = await this.prisma.authIdentity.findFirst({
      where: { userId, provider: AuthProvider.local },
    });
    if (!identity?.passwordHash) {
      throw new AppBadRequestException(
        'Für dieses Konto ist kein lokales Passwort hinterlegt. Lassen Sie es zunächst von einem Administrator zurücksetzen oder richten Sie eines über die Kontoeinstellungen ein.',
        'NO_LOCAL_PASSWORD',
      );
    }

    const valid = await argon2.verify(
      identity.passwordHash,
      dto.currentPassword,
    );
    if (!valid) {
      throw new AppUnauthorizedException(
        'Das aktuelle Passwort ist falsch.',
        'INVALID_CREDENTIALS',
      );
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

    await this.audit.log({
      entityType: 'User',
      entityId: userId,
      action: 'update',
      category: 'auth',
      summary: 'Passwort selbst geändert',
      userId,
    });
  }

  /** Whether email is configured, i.e. whether the "forgot password" flow can deliver anything. */
  async isPasswordResetAvailable(): Promise<boolean> {
    return this.email.isConfigured();
  }

  async updateTheme(
    userId: string,
    theme: ThemePreference,
  ): Promise<{ themePreference: ThemePreference }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { themePreference: theme },
      select: { themePreference: true },
    });
    return user;
  }

  /**
   * Self-service, unauthenticated password reset request. Always resolves
   * without error and without revealing whether the address is known, to
   * avoid turning this into a user-enumeration endpoint - callers rely on
   * throttling (see AuthController) against abuse instead.
   */
  async requestPasswordReset(email: string): Promise<void> {
    if (!(await this.email.isConfigured())) return;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || user.deletedAt) return;

    // At most one outstanding token per user - a fresh request invalidates
    // any link sent earlier.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const rawToken = crypto.randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    const frontendUrl = this.config.get<string>('frontendUrl');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    await this.email.sendPasswordResetEmail(
      user.email,
      resetUrl,
      user.displayName,
    );
  }

  /** Completes a password reset started via `requestPasswordReset`. Single-use, time-limited token. */
  async resetPasswordWithToken(
    token: string,
    newPassword: string,
    newPasswordConfirmation: string,
  ): Promise<void> {
    if (newPassword !== newPasswordConfirmation) {
      throw new AppBadRequestException(
        'Das neue Passwort und die Bestätigung stimmen nicht überein.',
        'PASSWORD_MISMATCH',
      );
    }

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    if (resetToken) {
      // Single-use: consume it up front so a reset attempt (even a failing
      // one, e.g. an expired token) can't be replayed.
      await this.prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
    }

    if (!resetToken || resetToken.expiresAt.getTime() < Date.now()) {
      throw new AppBadRequestException(
        'Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.',
        'INVALID_RESET_TOKEN',
      );
    }

    await this.users.resetPassword(resetToken.userId, { newPassword });
    await this.audit.log({
      entityType: 'User',
      entityId: resetToken.userId,
      action: 'update',
      category: 'auth',
      summary: 'Passwort per Reset-Link zurückgesetzt',
      userId: resetToken.userId,
    });
  }

  async login(user: User, deviceLabel?: string): Promise<TokenResponseDto> {
    const tokens = await this.issueTokens(user, deviceLabel);
    await this.logAuthEvent('login', user.id, `Anmeldung von "${user.email}"`);
    return tokens;
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
      themePreference: user.themePreference,
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
      throw new AppUnauthorizedException(
        'Der Refresh-Token ist ungültig oder abgelaufen.',
        'INVALID_REFRESH_TOKEN',
      );
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
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, revokedAt: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (existing && !existing.revokedAt) {
      await this.logAuthEvent('logout', existing.userId, 'Abmeldung');
    }
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

  async getChurchToolsAuthorizationUrl() {
    if (!(await this.appSettings.isChurchToolsEnabled())) {
      throw new AppBadRequestException(
        'Die Anmeldung über ChurchTools ist auf diesem System deaktiviert.',
        'CHURCHTOOLS_DISABLED',
      );
    }
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
    const tokens = await this.issueTokens(user);
    await this.logAuthEvent(
      'login',
      user.id,
      `Anmeldung von "${user.email}" via ChurchTools`,
    );
    return tokens;
  }

  private async upsertChurchToolsUser(
    profile: ChurchToolsProfile,
  ): Promise<User> {
    // ChurchTools may return the email in whatever casing the person used
    // when registering there; normalize it up front so it matches what we
    // store for local accounts and doesn't create a duplicate on re-login.
    profile = {
      ...profile,
      email: profile.email ? normalizeEmail(profile.email) : profile.email,
    };

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
      throw new AppBadRequestException(
        'Das ChurchTools-Profil enthält keine E-Mail-Adresse, die für die Kontoverknüpfung erforderlich ist.',
        'CHURCHTOOLS_EMAIL_MISSING',
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

  private async assertPasskeyEnabled(): Promise<void> {
    if (!(await this.appSettings.isPasskeyEnabled())) {
      throw new AppBadRequestException(
        'Die Anmeldung per Passkey ist auf diesem System deaktiviert.',
        'PASSKEY_DISABLED',
      );
    }
  }

  async createPasskeyRegistrationOptions(userId: string) {
    await this.assertPasskeyEnabled();
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
    await this.assertPasskeyEnabled();
    const verification = await this.webauthn.verifyRegistration(
      challengeId,
      response,
    );

    if (!verification.verified || !verification.registrationInfo) {
      throw new AppBadRequestException(
        'Die Passkey-Registrierung konnte nicht verifiziert werden.',
        'PASSKEY_VERIFICATION_FAILED',
      );
    }

    const { credential } = verification.registrationInfo;

    const existing = await this.prisma.authIdentity.findUnique({
      where: { credentialId: credential.id },
    });
    if (existing) {
      throw new AppConflictException(
        'Dieser Passkey ist bereits registriert.',
        'PASSKEY_ALREADY_REGISTERED',
      );
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
    await this.assertPasskeyEnabled();
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
    await this.assertPasskeyEnabled();
    const credentialId: string | undefined = response?.id;
    if (!credentialId) {
      throw new AppBadRequestException(
        'Die Antwort enthält keine Credential-ID.',
        'PASSKEY_CREDENTIAL_ID_MISSING',
      );
    }

    const identity = await this.prisma.authIdentity.findUnique({
      where: { credentialId },
      include: { user: true },
    });

    if (!identity || !identity.publicKey || identity.signCount === null) {
      throw new AppUnauthorizedException(
        'Unbekannter Passkey.',
        'UNKNOWN_PASSKEY',
      );
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
      await this.logAuthEvent(
        'login_failed',
        identity.user.id,
        `Fehlgeschlagene Passkey-Anmeldung für "${identity.user.email}"`,
      );
      throw new AppUnauthorizedException(
        'Die Passkey-Verifizierung ist fehlgeschlagen.',
        'PASSKEY_VERIFICATION_FAILED',
      );
    }

    await this.prisma.authIdentity.update({
      where: { id: identity.id },
      data: { signCount: BigInt(verification.authenticationInfo.newCounter) },
    });

    if (!identity.user.isActive || identity.user.deletedAt) {
      throw new AppUnauthorizedException(
        'Benutzer ist inaktiv.',
        'USER_INACTIVE',
      );
    }

    const tokens = await this.issueTokens(identity.user);
    await this.logAuthEvent(
      'login',
      identity.user.id,
      `Anmeldung von "${identity.user.email}" via Passkey`,
    );
    return tokens;
  }
}
