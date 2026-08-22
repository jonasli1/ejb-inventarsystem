import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentCategory, AttachmentEntityType } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../common/constants/permissions';
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
  private readonly uploadsDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    this.uploadsDir = path.resolve(
      this.config.get<string>('uploadsDir') ?? './uploads',
    );
  }

  private assertValidCategory(
    entityType: AttachmentEntityType,
    category: AttachmentCategory,
  ) {
    if (!CATEGORIES_BY_ENTITY[entityType].includes(category)) {
      throw new BadRequestException(
        `Category "${category}" is not valid for entity type "${entityType}".`,
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
          ? has(PERMISSIONS.ARTICLES_MANAGE)
          : has(PERMISSIONS.INVENTORY_VIEW);
    } else if (entityType === AttachmentEntityType.inventoryItem) {
      allowed =
        mode === 'write'
          ? has(PERMISSIONS.INVENTORY_MANAGE)
          : has(PERMISSIONS.INVENTORY_VIEW);
    } else if (entityType === AttachmentEntityType.loanItem) {
      const manageOrAdminister =
        has(PERMISSIONS.LOANS_MANAGE) || has(PERMISSIONS.LOANS_ADMINISTER);
      allowed =
        mode === 'write'
          ? manageOrAdminister
          : manageOrAdminister || has(PERMISSIONS.LOANS_VIEW);
    }
    if (!allowed) {
      throw new ForbiddenException(
        'You do not have permission to access these attachments.',
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
    if (!exists) throw new NotFoundException('Target entity not found.');
  }

  async list(
    entityType: AttachmentEntityType,
    entityId: string,
    category?: AttachmentCategory,
  ) {
    return this.prisma.attachment.findMany({
      where: {
        entityType,
        entityId,
        deletedAt: null,
        ...(category ? { category } : {}),
      },
      include: { uploadedBy: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
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
      throw new BadRequestException('No file uploaded.');
    }

    if (isImageCategory(category)) {
      if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          'Only JPEG, PNG, WebP or GIF images are allowed here.',
        );
      }
      if (file.size > IMAGE_MAX_BYTES) {
        throw new BadRequestException('Image exceeds the 8 MB size limit.');
      }
    } else {
      const ext = path.extname(file.originalname).toLowerCase();
      if (BLOCKED_DOCUMENT_EXTENSIONS.has(ext)) {
        throw new BadRequestException(`File type "${ext}" is not allowed.`);
      }
      if (file.size > DOCUMENT_MAX_BYTES) {
        throw new BadRequestException('File exceeds the 25 MB size limit.');
      }
    }

    // "image" is a single product photo: replace any existing one.
    if (category === AttachmentCategory.image) {
      await this.prisma.attachment.updateMany({
        where: { entityType, entityId, category, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }

    const fileName = sanitizeFileName(file.originalname || 'file');
    const storageKey = path.join(
      entityType,
      entityId,
      `${crypto.randomUUID()}__${fileName}`,
    );
    const absolutePath = path.join(this.uploadsDir, storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    const attachment = await this.prisma.attachment.create({
      data: {
        entityType,
        entityId,
        category,
        fileName: file.originalname || fileName,
        storageKey,
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

    return attachment;
  }

  async findById(id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    return attachment;
  }

  async getFileForDownload(id: string) {
    const attachment = await this.findById(id);
    const absolutePath = path.join(this.uploadsDir, attachment.storageKey);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('Attachment file is missing on disk.');
    }
    return attachment;
  }

  resolveAbsolutePath(storageKey: string): string {
    return path.join(this.uploadsDir, storageKey);
  }

  async remove(id: string, userId?: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
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
}

function entityTypeAuditLabel(
  entityType: AttachmentEntityType,
): 'Article' | 'InventoryItem' | 'Loan' {
  if (entityType === AttachmentEntityType.article) return 'Article';
  if (entityType === AttachmentEntityType.inventoryItem) return 'InventoryItem';
  return 'Loan';
}
