import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginate,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where: { deletedAt: null },
        include: { units: { where: { deletedAt: null } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.organization.count({ where: { deletedAt: null } }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: { units: { where: { deletedAt: null } } },
    });
    if (!organization) throw new NotFoundException('Organization not found.');
    return organization;
  }

  async create(dto: CreateOrganizationDto, actorId?: string) {
    const organization = await this.prisma.organization.create({
      data: dto,
    });
    await this.audit.log({
      entityType: 'Organization',
      entityId: organization.id,
      action: 'create',
      summary: `Organisation "${organization.name}" angelegt`,
      userId: actorId,
    });
    return organization;
  }

  async update(id: string, dto: UpdateOrganizationDto, actorId?: string) {
    const before = await this.findOne(id);
    const organization = await this.prisma.organization.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      entityType: 'Organization',
      entityId: id,
      action: 'update',
      summary: `Organisation "${before.name}" aktualisiert`,
      userId: actorId,
    });
    return organization;
  }

  async remove(id: string, actorId?: string) {
    const organization = await this.findOne(id);
    await this.prisma.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entityType: 'Organization',
      entityId: id,
      action: 'delete',
      summary: `Organisation "${organization.name}" gelöscht`,
      userId: actorId,
    });
  }
}
