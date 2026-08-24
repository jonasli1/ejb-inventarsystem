import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';

const SINGLETON_ID = 'singleton';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
];

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getOrCreate() {
    return this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
  }

  async getConfig() {
    const row = await this.getOrCreate();
    return {
      displayName: row.displayName,
      churchToolsEnabled: row.churchToolsEnabled,
      passkeyEnabled: row.passkeyEnabled,
      logoDataUrl:
        row.logoData && row.logoMimeType
          ? `data:${row.logoMimeType};base64,${Buffer.from(row.logoData).toString('base64')}`
          : null,
    };
  }

  /** Lean checks for AuthService's login-method enforcement - avoid pulling logo bytes on every attempt. */
  async isChurchToolsEnabled(): Promise<boolean> {
    const row = await this.prisma.appSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { churchToolsEnabled: true },
    });
    return row?.churchToolsEnabled ?? true;
  }

  async isPasskeyEnabled(): Promise<boolean> {
    const row = await this.prisma.appSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { passkeyEnabled: true },
    });
    return row?.passkeyEnabled ?? true;
  }

  async updateConfig(dto: UpdateAppSettingsDto, userId?: string) {
    await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {
        displayName: dto.displayName,
        churchToolsEnabled: dto.churchToolsEnabled,
        passkeyEnabled: dto.passkeyEnabled,
      },
      create: {
        id: SINGLETON_ID,
        displayName: dto.displayName ?? 'Inventarsystem',
        churchToolsEnabled: dto.churchToolsEnabled ?? true,
        passkeyEnabled: dto.passkeyEnabled ?? true,
      },
    });

    // Reuses 'Organization' as the entityType, same as EmailConfig/BackupConfig:
    // AuditEntityType has no dedicated variant for singleton config rows.
    await this.audit.log({
      entityType: 'Organization',
      entityId: SINGLETON_ID,
      action: 'update',
      summary: 'Allgemeine Einstellungen aktualisiert',
      userId,
    });

    return this.getConfig();
  }

  async uploadLogo(buffer: Buffer, mimeType: string, userId?: string) {
    if (!ALLOWED_LOGO_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        'Logo must be an image (PNG, JPEG, SVG or WebP).',
      );
    }
    if (buffer.length > MAX_LOGO_BYTES) {
      throw new BadRequestException('Logo must be at most 2 MB.');
    }

    await this.getOrCreate();
    await this.prisma.appSettings.update({
      where: { id: SINGLETON_ID },
      data: { logoData: Uint8Array.from(buffer), logoMimeType: mimeType },
    });
    await this.audit.log({
      entityType: 'Organization',
      entityId: SINGLETON_ID,
      action: 'update',
      summary: 'Logo aktualisiert',
      userId,
    });

    return this.getConfig();
  }

  async removeLogo(userId?: string): Promise<void> {
    await this.getOrCreate();
    await this.prisma.appSettings.update({
      where: { id: SINGLETON_ID },
      data: { logoData: null, logoMimeType: null },
    });
    await this.audit.log({
      entityType: 'Organization',
      entityId: SINGLETON_ID,
      action: 'update',
      summary: 'Logo entfernt',
      userId,
    });
  }
}
