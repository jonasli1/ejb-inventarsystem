import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginate,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { AppNotFoundException } from '../common/exceptions/app.exception';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

// Create/update/delete are audited automatically by AuditInterceptor (see
// the @Audited() decorator on OrganizationsController).
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (!organization)
      throw new AppNotFoundException('Organisation nicht gefunden.');
    return organization;
  }

  async create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({ data: dto });
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    await this.findOne(id);
    return this.prisma.organization.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
