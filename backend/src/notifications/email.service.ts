import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../backup/crypto.util';
import { NOTIFICATION_EVENT_BY_KEY } from './notification-events';
import { UpdateEmailConfigDto } from './dto/update-email-config.dto';

const SINGLETON_ID = 'singleton';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get secretKey(): string {
    return this.config.get<string>('backup.secretKey')!;
  }

  async getConfig() {
    const row = await this.prisma.emailConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
    return {
      enabled: row.enabled,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      passwordSet: !!row.passwordEnc,
      fromAddress: row.fromAddress,
      fromName: row.fromName,
    };
  }

  async updateConfig(dto: UpdateEmailConfigDto, userId?: string) {
    await this.prisma.emailConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {
        enabled: dto.enabled,
        host: dto.host,
        port: dto.port,
        secure: dto.secure,
        username: dto.username,
        ...(dto.password
          ? { passwordEnc: encryptSecret(dto.password, this.secretKey) }
          : {}),
        fromAddress: dto.fromAddress,
        fromName: dto.fromName,
      },
      create: {
        id: SINGLETON_ID,
        enabled: dto.enabled ?? false,
        host: dto.host,
        port: dto.port,
        secure: dto.secure ?? true,
        username: dto.username,
        passwordEnc: dto.password
          ? encryptSecret(dto.password, this.secretKey)
          : undefined,
        fromAddress: dto.fromAddress,
        fromName: dto.fromName,
      },
    });

    await this.audit.log({
      entityType: 'Organization',
      entityId: SINGLETON_ID,
      action: 'update',
      summary: 'E-Mail-Server-Konfiguration aktualisiert',
      userId,
    });

    return this.getConfig();
  }

  private async buildTransport(): Promise<{
    transport: nodemailer.Transporter;
    fromAddress: string;
    fromName: string | null;
  } | null> {
    const row = await this.prisma.emailConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (!row?.enabled || !row.host || !row.fromAddress) return null;

    const password = row.passwordEnc
      ? decryptSecret(row.passwordEnc, this.secretKey)
      : undefined;
    const transport = nodemailer.createTransport({
      host: row.host,
      port: row.port ?? 587,
      secure: row.secure,
      auth: row.username ? { user: row.username, pass: password } : undefined,
    });

    return { transport, fromAddress: row.fromAddress, fromName: row.fromName };
  }

  /** Whether email sending is fully configured and enabled - gates features like password reset. */
  async isConfigured(): Promise<boolean> {
    const row = await this.prisma.emailConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    return !!(row?.enabled && row.host && row.fromAddress);
  }

  private formatFrom(target: {
    fromAddress: string;
    fromName: string | null;
  }): string {
    return target.fromName
      ? `"${target.fromName}" <${target.fromAddress}>`
      : target.fromAddress;
  }

  async sendTestEmail(toAddress: string): Promise<void> {
    const target = await this.buildTransport();
    if (!target) {
      throw new BadRequestException(
        'E-Mail-Versand ist nicht konfiguriert oder nicht aktiviert.',
      );
    }
    await target.transport.sendMail({
      from: this.formatFrom(target),
      to: toAddress,
      subject: 'Test-E-Mail vom Inventarsystem',
      text: 'Diese Test-E-Mail bestätigt, dass der E-Mail-Versand korrekt konfiguriert ist.',
    });
  }

  /** Direct, single-recipient transactional email - not gated by notification preferences. */
  async sendPasswordResetEmail(
    toAddress: string,
    resetUrl: string,
  ): Promise<void> {
    const target = await this.buildTransport();
    if (!target) return;
    await target.transport.sendMail({
      from: this.formatFrom(target),
      to: toAddress,
      subject: 'Passwort zurücksetzen',
      text: `Zum Zurücksetzen deines Passworts klicke auf folgenden Link (gültig für 1 Stunde):\n\n${resetUrl}\n\nWenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren - dein Passwort bleibt unverändert.`,
    });
  }

  /**
   * Sends `subject`/`body` to every active user eligible for `eventKey` (i.e.
   * holding at least one of the permissions it requires), except those who
   * explicitly disabled it. Events are opt-out, not opt-in: eligibility is
   * queried directly from roles/permissions rather than from who has a
   * notificationPreference row, since a row's mere presence used to be the
   * only way to be subscribed at all - meaning nobody received a single
   * notification until they first discovered and visited their profile page
   * to turn events on individually. No-op if email is disabled.
   */
  async notifyEvent(
    eventKey: string,
    subject: string,
    body: string,
    // Further restricts eligible recipients beyond the event's base
    // permission requirement - e.g. loan.* events use this to only notify
    // approvers/issuers whose group is actually scoped to the loan's
    // organization/unit. Domain-specific (org scoping etc.) on purpose lives
    // in the caller, not here, so this service stays free of dependencies on
    // GroupsModule or any other domain module.
    eligible?: (recipient: { id: string; permissions: Set<string> }) => boolean,
  ): Promise<void> {
    const eventDef = NOTIFICATION_EVENT_BY_KEY.get(eventKey);
    if (!eventDef) return;

    const target = await this.buildTransport();
    if (!target) return;

    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              rolePermissions: {
                some: { permission: { key: { in: eventDef.permissions } } },
              },
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        notificationPreferences: {
          where: { eventKey },
          select: { enabled: true },
        },
        userRoles: {
          select: {
            role: {
              select: {
                rolePermissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    });

    for (const recipient of recipients) {
      if (recipient.notificationPreferences[0]?.enabled === false) continue;
      if (eligible) {
        const permissions = new Set(
          recipient.userRoles.flatMap((ur) =>
            ur.role.rolePermissions.map((rp) => rp.permission.key),
          ),
        );
        if (!eligible({ id: recipient.id, permissions })) continue;
      }

      try {
        await target.transport.sendMail({
          from: this.formatFrom(target),
          to: recipient.email,
          subject,
          text: body,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send "${eventKey}" notification to ${recipient.email}: ${String(err)}`,
        );
      }
    }
  }
}
