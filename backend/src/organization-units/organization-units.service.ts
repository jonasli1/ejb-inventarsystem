import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import { UpdateOrganizationUnitDto } from './dto/update-organization-unit.dto';

@Injectable()
export class OrganizationUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOrganizationExists(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!organization) throw new NotFoundException('Organization not found.');
  }

  async findAll(organizationId: string) {
    await this.assertOrganizationExists(organizationId);
    return this.prisma.organizationUnit.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const unit = await this.prisma.organizationUnit.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!unit) throw new NotFoundException('Organization unit not found.');
    return unit;
  }

  async create(organizationId: string, dto: CreateOrganizationUnitDto) {
    await this.assertOrganizationExists(organizationId);
    return this.prisma.organizationUnit.create({
      data: { ...dto, organizationId },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateOrganizationUnitDto,
  ) {
    await this.findOne(organizationId, id);
    return this.prisma.organizationUnit.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.organizationUnit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
