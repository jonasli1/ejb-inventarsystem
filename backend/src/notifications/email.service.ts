import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../backup/crypto.util';
import { getEffectivePermissions } from '../common/utils/effective-permissions';
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

  async sendTestEmail(toAddress: string): Promise<void> {
    const target = await this.buildTransport();
    if (!target) {
      throw new BadRequestException(
        'E-Mail-Versand ist nicht konfiguriert oder nicht aktiviert.',
      );
    }
    await target.transport.sendMail({
      from: target.fromName
        ? `"${target.fromName}" <${target.fromAddress}>`
        : target.fromAddress,
      to: toAddress,
      subject: 'Test-E-Mail vom Inventarsystem',
      text: 'Diese Test-E-Mail bestätigt, dass der E-Mail-Versand korrekt konfiguriert ist.',
    });
  }

  /**
   * Sends `subject`/`body` to every user subscribed to `eventKey`, re-checking
   * (defensively, in case a prune hook hasn't run yet) that each recipient
   * still holds a permission the event requires. No-op if email is disabled.
   */
  async notifyEvent(
    eventKey: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const eventDef = NOTIFICATION_EVENT_BY_KEY.get(eventKey);
    if (!eventDef) return;

    const target = await this.buildTransport();
    if (!target) return;

    const prefs = await this.prisma.notificationPreference.findMany({
      where: { eventKey },
      include: {
        user: {
          select: { id: true, email: true, isActive: true, deletedAt: true },
        },
      },
    });

    for (const pref of prefs) {
      if (!pref.user.isActive || pref.user.deletedAt) continue;
      const permissions = await getEffectivePermissions(
        this.prisma,
        pref.user.id,
      );
      if (!eventDef.permissions.some((p) => permissions.has(p))) continue;

      try {
        await target.transport.sendMail({
          from: target.fromName
            ? `"${target.fromName}" <${target.fromAddress}>`
            : target.fromAddress,
          to: pref.user.email,
          subject,
          text: body,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send "${eventKey}" notification to ${pref.user.email}: ${String(err)}`,
        );
      }
    }
  }
}
