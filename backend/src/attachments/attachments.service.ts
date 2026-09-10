import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttachmentCategory,
  AttachmentEntityType,
} from '../generated/prisma/client';
import sharp from 'sharp';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../common/constants/permissions';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const CATEGORIES_BY_ENTITY: Record<AttachmentEntityType, AttachmentCategory[]> =
  {
    article: [AttachmentCategory.image, AttachmentCategory.document],
    inventoryItem: [AttachmentCategory.document, AttachmentCategory.inspection],
    loanItem: [
      AttachmentCategory.checkoutPhoto,
      AttachmentCategory.returnPhoto,
    ],
  };

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
// Documents are deliberately not MIME-allowlisted (word/excel/pdf/config files
// are all explicitly in scope), just blocked from obviously executable types.
const BLOCKED_DOCUMENT_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.sh',
  '.dll',
  '.com',
]);

// Resized variants generated at upload time - list/search responses only
// ever expose the thumbnail URL, and the medium size covers most in-app
// detail views; the original is fetched separately, on demand, only when
// actually needed (full download or a "view full size" action).
const THUMBNAIL_MAX_DIMENSION = 200;
const MEDIUM_MAX_DIMENSION = 800;
const VARIANT_JPEG_QUALITY = 82;

function isImageCategory(category: AttachmentCategory): boolean {
  return (
    category === AttachmentCategory.image ||
    category === AttachmentCategory.checkoutPhoto ||
    category === AttachmentCategory.returnPhoto
  );
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-150);
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadsDir: string;
  private readonly apiPrefix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    this.uploadsDir = path.resolve(
      this.config.get<string>('uploadsDir') ?? './uploads',
    );
    this.apiPrefix = this.config.get<string>('apiPrefix') ?? 'api/v1';
  }

  private assertValidCategory(
    entityType: AttachmentEntityType,
    category: AttachmentCategory,
  ) {
    if (!CATEGORIES_BY_ENTITY[entityType].includes(category)) {
      throw new AppBadRequestException(
        `Die Kategorie "${category}" ist für den Entitätstyp "${entityType}" nicht gültig.`,
        'INVALID_ATTACHMENT_CATEGORY',
      );
    }
  }

  assertPermission(
    entityType: AttachmentEntityType,
    user: AuthenticatedUser,
    mode: 'read' | 'write',
  ) {
    const has = (key: string) => user.permissions.includes(key);
    let allowed = false;
    if (entityType === AttachmentEntityType.article) {
      allowed =
        mode === 'write'
          ? has(PERMISSIONS.ARTICLES_UPDATE)
          : has(PERMISSIONS.ARTICLES_READ);
    } else if (entityType === AttachmentEntityType.inventoryItem) {
      allowed =
        mode === 'write'
          ? has(PERMISSIONS.INVENTORY_UPDATE)
          : has(PERMISSIONS.INVENTORY_READ);
    } else if (entityType === AttachmentEntityType.loanItem) {
      const manageOrAdminister =
        has(PERMISSIONS.LOANS_MANAGE) || has(PERMISSIONS.LOANS_ADMINISTER);
      allowed =
        mode === 'write'
          ? manageOrAdminister
          : manageOrAdminister || has(PERMISSIONS.LOANS_READ);
    }
    if (!allowed) {
      throw new AppForbiddenException(
        'Sie haben keine Berechtigung, auf diese Anhänge zuzugreifen.',
        'MISSING_PERMISSION',
      );
    }
  }

  private async assertEntityExists(
    entityType: AttachmentEntityType,
    entityId: string,
  ) {
    let exists = false;
    if (entityType === AttachmentEntityType.article) {
      exists = !!(await this.prisma.article.findFirst({
        where: { id: entityId, deletedAt: null },
        select: { id: true },
      }));
    } else if (entityType === AttachmentEntityType.inventoryItem) {
      exists = !!(await this.prisma.inventoryItem.findFirst({
        where: { id: entityId, deletedAt: null },
        select: { id: true },
      }));
    } else if (entityType === AttachmentEntityType.loanItem) {
      exists = !!(await this.prisma.loanItem.findUnique({
        where: { id: entityId },
        select: { id: true },
      }));
    }
    if (!exists) throw new AppNotFoundException('Zielobjekt nicht gefunden.');
  }

  /** Attaches thumbnailUrl/mediumUrl (image categories only) + origin: 'own' to a raw attachment row for API responses - never the binary itself. */
  private toResponse<T extends { id: string; category: AttachmentCategory }>(
    attachment: T,
  ): T & {
    thumbnailUrl: string | null;
    mediumUrl: string | null;
    origin: 'own';
  } {
    const hasVariants = isImageCategory(attachment.category);
    return {
      ...attachment,
      thumbnailUrl: hasVariants
        ? `/${this.apiPrefix}/attachments/${attachment.id}/thumbnail`
        : null,
      mediumUrl: hasVariants
        ? `/${this.apiPrefix}/attachments/${attachment.id}/medium`
        : null,
      origin: 'own' as const,
    };
  }

  async list(
    entityType: AttachmentEntityType,
    entityId: string,
    category?: AttachmentCategory,
  ) {
    const rows = await this.prisma.attachment.findMany({
      where: {
        entityType,
        entityId,
        deletedAt: null,
        ...(category ? { category } : {}),
      },
      include: { uploadedBy: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async save(
    entityType: AttachmentEntityType,
    entityId: string,
    category: AttachmentCategory,
    file: Express.Multer.File,
    userId?: string,
  ) {
    this.assertValidCategory(entityType, category);
    await this.assertEntityExists(entityType, entityId);

    if (!file || !file.buffer?.length) {
      throw new AppBadRequestException(
        'Es wurde keine Datei hochgeladen.',
        'NO_FILE_UPLOADED',
      );
    }

    const isImage = isImageCategory(category);
    if (isImage) {
      if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
        throw new AppBadRequestException(
          'Nur JPEG-, PNG-, WebP- oder GIF-Bilder sind hier erlaubt.',
          'INVALID_FILE_TYPE',
        );
      }
      if (file.size > IMAGE_MAX_BYTES) {
        throw new AppBadRequestException(
          'Das Bild überschreitet die maximale Größe von 8 MB.',
          'FILE_TOO_LARGE',
        );
      }
    } else {
      const ext = path.extname(file.originalname).toLowerCase();
      if (BLOCKED_DOCUMENT_EXTENSIONS.has(ext)) {
        throw new AppBadRequestException(
          `Der Dateityp "${ext}" ist nicht erlaubt.`,
          'INVALID_FILE_TYPE',
        );
      }
      if (file.size > DOCUMENT_MAX_BYTES) {
        throw new AppBadRequestException(
          'Die Datei überschreitet die maximale Größe von 25 MB.',
          'FILE_TOO_LARGE',
        );
      }
    }

    // "image" is a single product photo: replace any existing one.
    if (category === AttachmentCategory.image) {
      const previous = await this.prisma.attachment.findMany({
        where: { entityType, entityId, category, deletedAt: null },
      });
      await this.prisma.attachment.updateMany({
        where: { id: { in: previous.map((p) => p.id) } },
        data: { deletedAt: new Date() },
      });
      // The replaced original + its variants are no longer referenced by
      // anything (soft-deleted rows never re-surface) - clean them up so
      // the uploads directory doesn't grow unboundedly with orphaned files.
      for (const p of previous) {
        await this.deleteFilesQuietly(p);
      }
    }

    const fileName = sanitizeFileName(file.originalname || 'file');
    const baseDir = path.join(entityType, entityId);
    const uid = crypto.randomUUID();
    const storageKey = path.join(baseDir, `${uid}__${fileName}`);
    const absolutePath = path.join(this.uploadsDir, storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    let thumbnailKey: string | undefined;
    let mediumKey: string | undefined;
    if (isImage) {
      try {
        thumbnailKey = await this.writeVariant(
          file.buffer,
          baseDir,
          uid,
          'thumb',
          THUMBNAIL_MAX_DIMENSION,
        );
        mediumKey = await this.writeVariant(
          file.buffer,
          baseDir,
          uid,
          'medium',
          MEDIUM_MAX_DIMENSION,
        );
      } catch (err) {
        // Never fail the upload just because variant generation failed
        // (e.g. a malformed image sharp can't parse) - the original is
        // already safely stored; variant endpoints fall back to it.
        this.logger.warn(
          `Failed to generate image variants for upload "${fileName}": ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        entityType,
        entityId,
        category,
        fileName: file.originalname || fileName,
        storageKey,
        thumbnailKey,
        mediumKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: userId,
      },
    });

    await this.audit.log({
      entityType: entityTypeAuditLabel(entityType),
      entityId,
      action: 'update',
      summary: `Datei "${attachment.fileName}" hochgeladen`,
      userId,
    });

    return this.toResponse(attachment);
  }

  private async writeVariant(
    original: Buffer,
    baseDir: string,
    uid: string,
    suffix: string,
    maxDimension: number,
  ): Promise<string> {
    const resized = await sharp(original)
      .rotate() // auto-orient from EXIF before resizing
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: VARIANT_JPEG_QUALITY })
      .toBuffer();

    const key = path.join(baseDir, `${uid}__${suffix}.jpg`);
    const absolutePath = path.join(this.uploadsDir, key);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, resized);
    return key;
  }

  async findById(id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new AppNotFoundException('Anhang nicht gefunden.');
    return attachment;
  }

  async getFileForDownload(id: string) {
    const attachment = await this.findById(id);
    const absolutePath = path.join(this.uploadsDir, attachment.storageKey);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new AppNotFoundException('Die Anhang-Datei fehlt auf dem Server.');
    }
    return attachment;
  }

  /** Resolves a thumbnail/medium variant's file, falling back to the original for attachments uploaded before variants existed. */
  async getFileForVariant(id: string, variant: 'thumbnail' | 'medium') {
    const attachment = await this.findById(id);
    const key =
      (variant === 'thumbnail'
        ? attachment.thumbnailKey
        : attachment.mediumKey) ?? attachment.storageKey;
    const absolutePath = path.join(this.uploadsDir, key);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new AppNotFoundException('Die Anhang-Datei fehlt auf dem Server.');
    }
    return {
      absolutePath,
      mimeType:
        key === attachment.storageKey ? attachment.mimeType : 'image/jpeg',
      fileName: attachment.fileName,
    };
  }

  resolveAbsolutePath(storageKey: string): string {
    return path.join(this.uploadsDir, storageKey);
  }

  async remove(id: string, userId?: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new AppNotFoundException('Anhang nicht gefunden.');
    await this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entityType: entityTypeAuditLabel(attachment.entityType),
      entityId: attachment.entityId,
      action: 'update',
      summary: `Datei "${attachment.fileName}" gelöscht`,
      userId,
    });
    return attachment;
  }

  private async deleteFilesQuietly(attachment: {
    storageKey: string;
    thumbnailKey: string | null;
    mediumKey: string | null;
  }): Promise<void> {
    for (const key of [
      attachment.storageKey,
      attachment.thumbnailKey,
      attachment.mediumKey,
    ]) {
      if (!key) continue;
      await fs.unlink(path.join(this.uploadsDir, key)).catch(() => undefined);
    }
  }
}

function entityTypeAuditLabel(
  entityType: AttachmentEntityType,
): 'Article' | 'InventoryItem' | 'Loan' {
  if (entityType === AttachmentEntityType.article) return 'Article';
  if (entityType === AttachmentEntityType.inventoryItem) return 'InventoryItem';
  return 'Loan';
}
