import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppBadRequestException } from '../common/exceptions/app.exception';
import { decryptSecret, encryptSecret } from '../backup/crypto.util';
import { NOTIFICATION_EVENT_BY_KEY } from './notification-events';
import {
  htmlToPlainText,
  renderTemplate,
  wrapEmailHtml,
} from './email-template.util';
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
      footerHtml: row.footerHtml,
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
        footerHtml: dto.footerHtml,
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
        footerHtml: dto.footerHtml,
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

  private async appBranding(): Promise<{
    appName: string;
    logoDataUrl: string | null;
    footerHtml: string | null;
  }> {
    const [appSettings, emailConfig] = await Promise.all([
      this.prisma.appSettings.findUnique({ where: { id: SINGLETON_ID } }),
      this.prisma.emailConfig.findUnique({ where: { id: SINGLETON_ID } }),
    ]);
    return {
      appName: appSettings?.displayName ?? 'Inventarsystem',
      logoDataUrl:
        appSettings?.logoData && appSettings.logoMimeType
          ? `data:${appSettings.logoMimeType};base64,${Buffer.from(appSettings.logoData).toString('base64')}`
          : null,
      footerHtml: emailConfig?.footerHtml ?? null,
    };
  }

  /**
   * Renders an event's (admin-customized or built-in default) template with
   * the given variables into a ready-to-send subject/html/text triple,
   * wrapped in the shared responsive HTML shell (logo + app name).
   */
  private async renderEmail(
    eventKey: string,
    variables: Record<string, string>,
  ): Promise<{ subject: string; html: string; text: string }> {
    const eventDef = NOTIFICATION_EVENT_BY_KEY.get(eventKey);
    const [templateRow, branding] = await Promise.all([
      this.prisma.notificationTemplate.findUnique({ where: { eventKey } }),
      this.appBranding(),
    ]);

    const allVariables = { appName: branding.appName, ...variables };
    const subjectTemplate = templateRow?.subject ?? eventDef?.defaultSubject ?? eventKey;
    const bodyTemplate = templateRow?.bodyHtml ?? eventDef?.defaultBodyHtml ?? '';

    const subject = renderTemplate(subjectTemplate, allVariables);
    const renderedBody = renderTemplate(bodyTemplate, allVariables);
    const html = wrapEmailHtml({
      appName: branding.appName,
      logoDataUrl: branding.logoDataUrl,
      footerHtml: branding.footerHtml,
      bodyHtml: renderedBody,
    });

    return { subject, html, text: htmlToPlainText(renderedBody) };
  }

  async sendTestEmail(toAddress: string): Promise<void> {
    const target = await this.buildTransport();
    if (!target) {
      throw new AppBadRequestException(
        'E-Mail-Versand ist nicht konfiguriert oder nicht aktiviert.',
        'EMAIL_NOT_CONFIGURED',
      );
    }
    const branding = await this.appBranding();
    const bodyHtml =
      '<p>Diese Test-E-Mail bestätigt, dass der E-Mail-Versand korrekt konfiguriert ist.</p>';
    await target.transport.sendMail({
      from: this.formatFrom(target),
      to: toAddress,
      subject: 'Test-E-Mail',
      html: wrapEmailHtml({ ...branding, bodyHtml }),
      text: htmlToPlainText(bodyHtml),
    });
  }

  /** Direct, single-recipient transactional email - not gated by notification preferences. */
  async sendPasswordResetEmail(
    toAddress: string,
    resetUrl: string,
    recipientName: string,
  ): Promise<void> {
    const target = await this.buildTransport();
    if (!target) return;
    const { subject, html, text } = await this.renderEmail('password.reset', {
      recipientName,
      resetUrl,
    });
    await target.transport.sendMail({
      from: this.formatFrom(target),
      to: toAddress,
      subject,
      html,
      text,
    });
  }

  /**
   * Sends the rendered template for `eventKey` to every active user eligible
   * for it (i.e. holding at least one of the permissions it requires),
   * except those who explicitly disabled it. Events are opt-out, not
   * opt-in: eligibility is queried directly from roles/permissions rather
   * than from who has a notificationPreference row, since a row's mere
   * presence used to be the only way to be subscribed at all - meaning
   * nobody received a single notification until they first discovered and
   * visited their profile page to turn events on individually. No-op if
   * email is disabled.
   */
  async notifyEvent(
    eventKey: string,
    // Event-specific {{placeholder}} values (see notification-events.ts);
    // `recipientName` and `appName` are filled in automatically per
    // recipient/globally and don't need to be passed here.
    variables: Record<string, string>,
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
        displayName: true,
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
        const { subject, html, text } = await this.renderEmail(eventKey, {
          ...variables,
          recipientName: recipient.displayName,
        });
        await target.transport.sendMail({
          from: this.formatFrom(target),
          to: recipient.email,
          subject,
          html,
          text,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send "${eventKey}" notification to ${recipient.email}: ${String(err)}`,
        );
      }
    }
  }
}
