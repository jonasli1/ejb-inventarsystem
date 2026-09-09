import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

// A real, tiny, valid 1x1 PNG - lets the tests exercise the actual sharp
// resize pipeline instead of mocking it away, which is what would actually
// catch a broken image-processing call.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function imageFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    buffer: TINY_PNG,
    originalname: 'photo.png',
    mimetype: 'image/png',
    size: TINY_PNG.length,
    ...overrides,
  } as Express.Multer.File;
}

const readUser = (permissions: string[]): AuthenticatedUser => ({
  id: 'user-1',
  email: 'u@example.com',
  displayName: 'U',
  permissions,
});

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: {
    article: { findFirst: jest.Mock };
    inventoryItem: { findFirst: jest.Mock };
    loanItem: { findUnique: jest.Mock };
    attachment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let uploadsDir: string;

  beforeEach(async () => {
    uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attachments-test-'));
    prisma = {
      article: { findFirst: jest.fn().mockResolvedValue({ id: 'article-1' }) },
      inventoryItem: { findFirst: jest.fn() },
      loanItem: { findUnique: jest.fn() },
      attachment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'attachment-1', createdAt: new Date(), ...data }),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'uploadsDir') return uploadsDir;
        if (key === 'apiPrefix') return 'api/v1';
        return undefined;
      }),
    };
    service = new AttachmentsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      config as unknown as ConfigService,
    );
  });

  afterEach(async () => {
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  describe('assertPermission', () => {
    it('allows an article read with articles.read', () => {
      expect(() =>
        service.assertPermission('article', readUser(['articles.read']), 'read'),
      ).not.toThrow();
    });

    it('refuses an article write without articles.update', () => {
      expect(() =>
        service.assertPermission('article', readUser(['articles.read']), 'write'),
      ).toThrow(AppForbiddenException);
    });

    it("a loans.view-only user may read but not write loanItem attachments", () => {
      expect(() =>
        service.assertPermission('loanItem', readUser(['loans.read']), 'read'),
      ).not.toThrow();
      expect(() =>
        service.assertPermission('loanItem', readUser(['loans.read']), 'write'),
      ).toThrow(AppForbiddenException);
    });
  });

  describe('save', () => {
    it('rejects a category invalid for the entity type', async () => {
      await expect(
        service.save('article', 'article-1', 'inspection' as never, imageFile()),
      ).rejects.toThrow(AppBadRequestException);
    });

    it('rejects when the target entity does not exist', async () => {
      prisma.article.findFirst.mockResolvedValue(null);
      await expect(
        service.save('article', 'missing', 'image', imageFile()),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('rejects a non-image MIME type for an image category', async () => {
      await expect(
        service.save(
          'article',
          'article-1',
          'image',
          imageFile({ mimetype: 'application/pdf' }),
        ),
      ).rejects.toThrow(AppBadRequestException);
    });

    it('rejects a blocked executable extension for a document category', async () => {
      await expect(
        service.save('article', 'article-1', 'document', {
          buffer: Buffer.from('x'),
          originalname: 'malware.exe',
          mimetype: 'application/octet-stream',
          size: 1,
        } as Express.Multer.File),
      ).rejects.toThrow(AppBadRequestException);
    });

    it('writes the original file to disk and generates thumbnail + medium variants for an image category', async () => {
      const result = await service.save(
        'article',
        'article-1',
        'image',
        imageFile(),
        'user-1',
      );

      expect(result.thumbnailUrl).toBe(
        '/api/v1/attachments/attachment-1/thumbnail',
      );
      expect(result.mediumUrl).toBe('/api/v1/attachments/attachment-1/medium');
      expect(result.origin).toBe('own');

      const createCall = prisma.attachment.create.mock.calls[0][0].data;
      expect(createCall.thumbnailKey).toBeTruthy();
      expect(createCall.mediumKey).toBeTruthy();

      const originalExists = await fs
        .access(path.join(uploadsDir, createCall.storageKey))
        .then(() => true)
        .catch(() => false);
      const thumbExists = await fs
        .access(path.join(uploadsDir, createCall.thumbnailKey))
        .then(() => true)
        .catch(() => false);
      expect(originalExists).toBe(true);
      expect(thumbExists).toBe(true);
    });

    it('does not generate variants for a document category', async () => {
      await service.save('article', 'article-1', 'document', {
        buffer: Buffer.from('hello'),
        originalname: 'manual.pdf',
        mimetype: 'application/pdf',
        size: 5,
      } as Express.Multer.File);

      const createCall = prisma.attachment.create.mock.calls[0][0].data;
      expect(createCall.thumbnailKey).toBeUndefined();
      expect(createCall.mediumKey).toBeUndefined();
    });

    it('soft-deletes and removes the files of a previous "image" category upload when replaced', async () => {
      const oldFilePath = path.join(uploadsDir, 'article', 'article-1', 'old.png');
      await fs.mkdir(path.dirname(oldFilePath), { recursive: true });
      await fs.writeFile(oldFilePath, TINY_PNG);
      prisma.attachment.findMany.mockResolvedValue([
        {
          id: 'old-attachment',
          storageKey: 'article/article-1/old.png',
          thumbnailKey: null,
          mediumKey: null,
        },
      ]);

      await service.save('article', 'article-1', 'image', imageFile());

      expect(prisma.attachment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-attachment'] } },
        data: { deletedAt: expect.any(Date) },
      });
      const stillExists = await fs
        .access(oldFilePath)
        .then(() => true)
        .catch(() => false);
      expect(stillExists).toBe(false);
    });
  });

  describe('getFileForVariant', () => {
    it('falls back to the original file for an attachment uploaded before variants existed', async () => {
      const originalPath = path.join(uploadsDir, 'legacy.png');
      await fs.writeFile(originalPath, TINY_PNG);
      prisma.attachment.findFirst.mockResolvedValue({
        id: 'legacy-1',
        storageKey: 'legacy.png',
        thumbnailKey: null,
        mediumKey: null,
        mimeType: 'image/png',
        fileName: 'legacy.png',
        deletedAt: null,
      });

      const file = await service.getFileForVariant('legacy-1', 'thumbnail');
      expect(file.absolutePath).toBe(originalPath);
      expect(file.mimeType).toBe('image/png');
    });

    it('uses the stored thumbnailKey when present', async () => {
      const thumbPath = path.join(uploadsDir, 'thumb.jpg');
      await fs.writeFile(thumbPath, TINY_PNG);
      prisma.attachment.findFirst.mockResolvedValue({
        id: 'attachment-2',
        storageKey: 'original.png',
        thumbnailKey: 'thumb.jpg',
        mediumKey: null,
        mimeType: 'image/png',
        fileName: 'photo.png',
        deletedAt: null,
      });

      const file = await service.getFileForVariant('attachment-2', 'thumbnail');
      expect(file.absolutePath).toBe(thumbPath);
      expect(file.mimeType).toBe('image/jpeg');
    });

    it('throws when the resolved file is missing on disk', async () => {
      prisma.attachment.findFirst.mockResolvedValue({
        id: 'attachment-3',
        storageKey: 'does-not-exist.png',
        thumbnailKey: null,
        mediumKey: null,
        mimeType: 'image/png',
        fileName: 'x.png',
        deletedAt: null,
      });
      await expect(
        service.getFileForVariant('attachment-3', 'thumbnail'),
      ).rejects.toThrow(AppNotFoundException);
    });
  });

  describe('list', () => {
    it('never includes raw file bytes, only metadata + variant URLs', async () => {
      prisma.attachment.findMany.mockResolvedValue([
        {
          id: 'a1',
          category: 'image',
          fileName: 'x.png',
          storageKey: 'x.png',
          thumbnailKey: 'x_thumb.jpg',
          mediumKey: 'x_medium.jpg',
          mimeType: 'image/png',
          sizeBytes: 123,
        },
      ]);
      const result = await service.list('article', 'article-1');
      expect(result[0]).not.toHaveProperty('buffer');
      expect(result[0].thumbnailUrl).toBe('/api/v1/attachments/a1/thumbnail');
      expect(result[0].origin).toBe('own');
    });
  });
});
