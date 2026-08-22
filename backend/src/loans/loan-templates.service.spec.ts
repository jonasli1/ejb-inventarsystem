import { NotFoundException } from '@nestjs/common';
import { LoanTemplatesService } from './loan-templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('LoanTemplatesService', () => {
  let service: LoanTemplatesService;
  let prisma: {
    loanTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      loanTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'template-1', ...data }),
          ),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new LoanTemplatesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('findOne', () => {
    it('throws NotFoundException when missing', async () => {
      prisma.loanTemplate.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates a template with its items and logs it', async () => {
      const dto = {
        name: 'Sonntagsgottesdienst',
        items: [{ articleId: 'article-1', quantity: 2 }],
      };
      const template = await service.create(dto, 'user-1');
      expect(template.id).toBe('template-1');
      expect(prisma.loanTemplate.create).toHaveBeenCalledWith({
        data: {
          name: 'Sonntagsgottesdienst',
          notes: undefined,
          createdById: 'user-1',
          items: { create: [{ articleId: 'article-1', quantity: 2 }] },
        },
        include: { items: { include: { article: true } } },
      });
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the template does not exist', async () => {
      prisma.loanTemplate.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.loanTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing template', async () => {
      prisma.loanTemplate.findUnique.mockResolvedValue({
        id: 'template-1',
        name: 'Sonntagsgottesdienst',
      });
      await service.remove('template-1', 'user-1');
      expect(prisma.loanTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'template-1' },
      });
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('createFromResolvedItems', () => {
    it('aggregates repeated article ids into a quantity per article', async () => {
      await service.createFromResolvedItems(
        'Vom Ausleihvorgang',
        ['article-1', 'article-1', 'article-2'],
        'user-1',
      );
      expect(prisma.loanTemplate.create).toHaveBeenCalledWith({
        data: {
          name: 'Vom Ausleihvorgang',
          createdById: 'user-1',
          items: {
            create: [
              { articleId: 'article-1', quantity: 2 },
              { articleId: 'article-2', quantity: 1 },
            ],
          },
        },
      });
      expect(audit.log).toHaveBeenCalled();
    });
  });
});
