import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupDestinationType } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as tar from 'tar';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from './crypto.util';
import { pgDump, pgRestoreApply, pgRestoreValidate } from './pg-dump.util';
import { SftpUploaderService, type SftpTarget } from './sftp-uploader.service';
import { OneDriveUploaderService } from './onedrive-uploader.service';
import { EmailService } from '../notifications/email.service';
import { UpdateBackupConfigDto } from './dto/update-backup-config.dto';

const SINGLETON_ID = 'singleton';
const DUMP_ENTRY = 'database.dump';
const UPLOADS_ENTRY = 'uploads';

export interface BackupFile {
  buffer: Buffer;
  filename: string;
}

@Injectable()
export class BackupService {
  private readonly uploadsDir: string;
  private readonly tmpRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly sftp: SftpUploaderService,
    private readonly onedrive: OneDriveUploaderService,
    private readonly email: EmailService,
  ) {
    this.uploadsDir = path.resolve(
      this.config.get<string>('uploadsDir') ?? './uploads',
    );
    this.tmpRoot = path.join(process.cwd(), 'backup-tmp');
  }

  private get databaseUrl(): string {
    return this.config.get<string>('database.url')!;
  }

  private get secretKey(): string {
    return this.config.get<string>('backup.secretKey')!;
  }

  private async withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = path.join(this.tmpRoot, crypto.randomUUID());
    await fs.mkdir(dir, { recursive: true });
    try {
      return await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------

  async getConfig() {
    const row = await this.prisma.backupConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
    return {
      enabled: row.enabled,
      frequency: row.frequency,
      destinationType: row.destinationType,
      sftpHost: row.sftpHost,
      sftpPort: row.sftpPort,
      sftpUsername: row.sftpUsername,
      sftpPasswordSet: !!row.sftpPasswordEnc,
      sftpRemotePath: row.sftpRemotePath,
      onedriveConnected: !!row.onedriveRefreshTokenEnc,
      onedriveFolderPath: row.onedriveFolderPath,
      onedriveConfigured: this.onedrive.isConfigured(),
      lastRunAt: row.lastRunAt,
      lastRunStatus: row.lastRunStatus,
      lastRunMessage: row.lastRunMessage,
    };
  }

  async updateConfig(dto: UpdateBackupConfigDto, userId?: string) {
    await this.prisma.backupConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {
        enabled: dto.enabled,
        frequency: dto.frequency,
        destinationType: dto.destinationType,
        sftpHost: dto.sftpHost,
        sftpPort: dto.sftpPort,
        sftpUsername: dto.sftpUsername,
        ...(dto.sftpPassword
          ? { sftpPasswordEnc: encryptSecret(dto.sftpPassword, this.secretKey) }
          : {}),
        sftpRemotePath: dto.sftpRemotePath,
        onedriveFolderPath: dto.onedriveFolderPath,
      },
      create: {
        id: SINGLETON_ID,
        enabled: dto.enabled ?? false,
        frequency: dto.frequency,
        destinationType: dto.destinationType,
        sftpHost: dto.sftpHost,
        sftpPort: dto.sftpPort,
        sftpUsername: dto.sftpUsername,
        sftpPasswordEnc: dto.sftpPassword
          ? encryptSecret(dto.sftpPassword, this.secretKey)
          : undefined,
        sftpRemotePath: dto.sftpRemotePath,
        onedriveFolderPath: dto.onedriveFolderPath,
      },
    });
    await this.audit.log({
      entityType: 'Organization',
      entityId: SINGLETON_ID,
      action: 'update',
      summary: 'Backup-Konfiguration aktualisiert',
      userId,
    });
    return this.getConfig();
  }

  async getOneDriveAuthorizationUrl(): Promise<string> {
    if (!this.onedrive.isConfigured()) {
      throw new BadRequestException(
        'Microsoft OAuth is not configured (MS_CLIENT_ID/MS_CLIENT_SECRET/MS_REDIRECT_URI).',
      );
    }
    return this.onedrive.getAuthorizationUrl(crypto.randomUUID());
  }

  async handleOneDriveCallback(code: string, userId?: string): Promise<void> {
    const tokens = await this.onedrive.exchangeCode(code);
    await this.prisma.backupConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {
        onedriveRefreshTokenEnc: encryptSecret(
          tokens.refreshToken,
          this.secretKey,
        ),
      },
      create: {
        id: SINGLETON_ID,
        onedriveRefreshTokenEnc: encryptSecret(
          tokens.refreshToken,
          this.secretKey,
        ),
      },
    });
    await this.audit.log({
      entityType: 'Organization',
      entityId: SINGLETON_ID,
      action: 'update',
      summary: 'OneDrive für Backups verbunden',
      userId,
    });
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const row = await this.prisma.backupConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (!row?.destinationType) {
      throw new BadRequestException('No backup destination configured.');
    }
    try {
      if (row.destinationType === BackupDestinationType.sftp) {
        await this.sftp.test(this.sftpTargetFromRow(row, 'test.tmp'));
      } else {
        const accessToken = await this.getOneDriveAccessToken(row);
        await this.onedrive.test(accessToken);
      }
      return { ok: true, message: 'Verbindung erfolgreich.' };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : 'Verbindung fehlgeschlagen.',
      };
    }
  }

  private sftpTargetFromRow(
    row: {
      sftpHost: string | null;
      sftpPort: number | null;
      sftpUsername: string | null;
      sftpPasswordEnc: string | null;
      sftpRemotePath: string | null;
    },
    _fileHint: string,
  ): SftpTarget {
    if (!row.sftpHost || !row.sftpUsername || !row.sftpPasswordEnc) {
      throw new BadRequestException(
        'SFTP destination is not fully configured.',
      );
    }
    return {
      host: row.sftpHost,
      port: row.sftpPort ?? 22,
      username: row.sftpUsername,
      password: decryptSecret(row.sftpPasswordEnc, this.secretKey),
      remotePath: row.sftpRemotePath ?? '/',
    };
  }

  private async getOneDriveAccessToken(row: {
    onedriveRefreshTokenEnc: string | null;
  }): Promise<string> {
    if (!row.onedriveRefreshTokenEnc) {
      throw new BadRequestException('OneDrive is not connected.');
    }
    const refreshToken = decryptSecret(
      row.onedriveRefreshTokenEnc,
      this.secretKey,
    );
    const tokens = await this.onedrive.refreshAccessToken(refreshToken);
    // Microsoft rotates refresh tokens on every use; persist the new one.
    await this.prisma.backupConfig.update({
      where: { id: SINGLETON_ID },
      data: {
        onedriveRefreshTokenEnc: encryptSecret(
          tokens.refreshToken,
          this.secretKey,
        ),
      },
    });
    return tokens.accessToken;
  }

  // ---------------------------------------------------------------------
  // Export / import
  // ---------------------------------------------------------------------

  async exportBackup(): Promise<BackupFile> {
    return this.withTmpDir(async (dir) => {
      const stagingDir = path.join(dir, 'staging');
      await fs.mkdir(stagingDir, { recursive: true });

      await pgDump(this.databaseUrl, path.join(stagingDir, DUMP_ENTRY));

      const uploadsTarget = path.join(stagingDir, UPLOADS_ENTRY);
      await fs.mkdir(uploadsTarget, { recursive: true });
      if (await this.pathExists(this.uploadsDir)) {
        await fs.cp(this.uploadsDir, uploadsTarget, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivePath = path.join(
        dir,
        `inventarsystem-backup-${timestamp}.tar.gz`,
      );
      await tar.create({ gzip: true, file: archivePath, cwd: stagingDir }, [
        DUMP_ENTRY,
        UPLOADS_ENTRY,
      ]);

      const buffer = await fs.readFile(archivePath);
      return { buffer, filename: path.basename(archivePath) };
    });
  }

  /** Validates a backup archive's integrity without applying it. Throws if corrupted/malformed. */
  async validateArchive(buffer: Buffer): Promise<void> {
    await this.withTmpDir(async (dir) => {
      const extractDir = await this.extractArchive(buffer, dir);
      const dumpPath = path.join(extractDir, DUMP_ENTRY);
      if (!(await this.pathExists(dumpPath))) {
        throw new BadRequestException(
          'Backup archive is missing the database dump.',
        );
      }
      try {
        await pgRestoreValidate(dumpPath);
      } catch {
        throw new BadRequestException(
          'Backup archive appears to be corrupted (pg_restore could not read it).',
        );
      }
    });
  }

  /** Restores a backup, overwriting the current database and uploads directory entirely. */
  async importBackup(buffer: Buffer, userId?: string): Promise<void> {
    await this.withTmpDir(async (dir) => {
      const extractDir = await this.extractArchive(buffer, dir);
      const dumpPath = path.join(extractDir, DUMP_ENTRY);
      const uploadsSource = path.join(extractDir, UPLOADS_ENTRY);

      if (!(await this.pathExists(dumpPath))) {
        throw new BadRequestException(
          'Backup archive is missing the database dump.',
        );
      }
      try {
        await pgRestoreValidate(dumpPath);
      } catch {
        throw new BadRequestException(
          'Backup archive appears to be corrupted; aborting before any changes were made.',
        );
      }

      // Validated -- now actually overwrite.
      await pgRestoreApply(this.databaseUrl, dumpPath);

      if (await this.pathExists(uploadsSource)) {
        // Only clear the *contents* of uploadsDir, never the directory entry
        // itself: in Docker it's a named-volume mount point, which the
        // non-root container user can write into but cannot rmdir/recreate.
        await this.clearDirContents(this.uploadsDir);
        await fs.cp(uploadsSource, this.uploadsDir, { recursive: true });
      }
    });

    // The audit log itself was just wiped and recreated by the restore, so this
    // entry is the first new one in the freshly-restored database.
    await this.audit.log({
      entityType: 'Organization',
      entityId: SINGLETON_ID,
      action: 'update',
      summary: 'System aus Backup wiederhergestellt (alle Daten überschrieben)',
      userId,
    });
  }

  private async extractArchive(buffer: Buffer, dir: string): Promise<string> {
    const archivePath = path.join(dir, 'upload.tar.gz');
    await fs.writeFile(archivePath, buffer);
    const extractDir = path.join(dir, 'extracted');
    await fs.mkdir(extractDir, { recursive: true });
    try {
      await tar.extract({ file: archivePath, cwd: extractDir });
    } catch {
      throw new BadRequestException(
        'Uploaded file is not a valid backup archive.',
      );
    }
    return extractDir;
  }

  /** Deletes every entry inside `dir`, leaving `dir` itself (its inode/mount point) untouched. */
  private async clearDirContents(dir: string): Promise<void> {
    if (!(await this.pathExists(dir))) {
      await fs.mkdir(dir, { recursive: true });
      return;
    }
    const entries = await fs.readdir(dir);
    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(dir, entry), { recursive: true, force: true }),
      ),
    );
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Used by the scheduler
  // ---------------------------------------------------------------------

  async runScheduledBackupIfDue(): Promise<void> {
    const row = await this.prisma.backupConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (!row?.enabled || !row.destinationType) return;
    if (!this.isDue(row.frequency, row.lastRunAt)) return;

    try {
      const backup = await this.exportBackup();
      if (row.destinationType === BackupDestinationType.sftp) {
        await this.sftp.upload(
          this.sftpTargetFromRow(row, backup.filename),
          backup.buffer,
          backup.filename,
        );
      } else {
        const accessToken = await this.getOneDriveAccessToken(row);
        await this.onedrive.upload(
          accessToken,
          row.onedriveFolderPath ?? '/',
          backup.buffer,
          backup.filename,
        );
      }
      await this.prisma.backupConfig.update({
        where: { id: SINGLETON_ID },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: 'success',
          lastRunMessage: backup.filename,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.backupConfig.update({
        where: { id: SINGLETON_ID },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: 'error',
          lastRunMessage: message,
        },
      });
      await this.email.notifyEvent(
        'backup.failed',
        'Automatisches Backup fehlgeschlagen',
        `Das automatische Backup ist fehlgeschlagen: ${message}`,
      );
    }
  }

  private isDue(frequency: string, lastRunAt: Date | null): boolean {
    if (!lastRunAt) return true;
    const elapsedMs = Date.now() - lastRunAt.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (frequency === 'daily') return elapsedMs >= dayMs;
    if (frequency === 'weekly') return elapsedMs >= 7 * dayMs;
    if (frequency === 'monthly') return elapsedMs >= 30 * dayMs;
    return false;
  }
}
