import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateLoanTemplateDto } from './dto/create-loan-template.dto';

const TEMPLATE_INCLUDE = {
  items: { include: { article: true } },
} satisfies Prisma.LoanTemplateInclude;

@Injectable()
export class LoanTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.loanTemplate.findMany({
      include: TEMPLATE_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.loanTemplate.findUnique({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException('Loan template not found.');
    return template;
  }

  async create(dto: CreateLoanTemplateDto, actorId?: string) {
    const template = await this.prisma.loanTemplate.create({
      data: {
        name: dto.name,
        notes: dto.notes,
        createdById: actorId,
        items: {
          create: dto.items.map((i) => ({
            articleId: i.articleId,
            quantity: i.quantity ?? 1,
          })),
        },
      },
      include: TEMPLATE_INCLUDE,
    });

    await this.audit.log({
      entityType: 'LoanTemplate',
      entityId: template.id,
      action: 'create',
      summary: `Ausleihe-Vorlage "${template.name}" angelegt`,
      userId: actorId,
    });

    return template;
  }

  async remove(id: string, actorId?: string) {
    const template = await this.findOne(id);
    await this.prisma.loanTemplate.delete({ where: { id } });

    await this.audit.log({
      entityType: 'LoanTemplate',
      entityId: id,
      action: 'delete',
      summary: `Ausleihe-Vorlage "${template.name}" gelöscht`,
      userId: actorId,
    });
  }

  /** Aggregates resolved loan items into article+quantity groups and saves them as a new template. */
  async createFromResolvedItems(
    name: string,
    resolvedArticleIds: string[],
    actorId?: string,
  ): Promise<void> {
    const quantities = new Map<string, number>();
    for (const articleId of resolvedArticleIds) {
      quantities.set(articleId, (quantities.get(articleId) ?? 0) + 1);
    }

    const template = await this.prisma.loanTemplate.create({
      data: {
        name,
        createdById: actorId,
        items: {
          create: [...quantities.entries()].map(([articleId, quantity]) => ({
            articleId,
            quantity,
          })),
        },
      },
    });

    await this.audit.log({
      entityType: 'LoanTemplate',
      entityId: template.id,
      action: 'create',
      summary: `Ausleihe-Vorlage "${name}" aus Ausleihe gespeichert`,
      userId: actorId,
    });
  }
}
