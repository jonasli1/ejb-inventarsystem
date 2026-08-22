import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.location.findMany({
      where: { deletedAt: null },
      include: { rooms: { where: { deletedAt: null } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      include: { rooms: { where: { deletedAt: null } } },
    });
    if (!location) throw new NotFoundException('Location not found.');
    return location;
  }

  async create(dto: CreateLocationDto, actorId?: string) {
    const location = await this.prisma.location.create({ data: dto });
    await this.audit.log({
      entityType: 'Location',
      entityId: location.id,
      action: 'create',
      summary: `Standort "${location.name}" angelegt`,
      userId: actorId,
    });
    return location;
  }

  async update(id: string, dto: UpdateLocationDto, actorId?: string) {
    const before = await this.findOne(id);
    const location = await this.prisma.location.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      entityType: 'Location',
      entityId: id,
      action: 'update',
      summary: `Standort "${before.name}" aktualisiert`,
      userId: actorId,
    });
    return location;
  }

  async remove(id: string, actorId?: string) {
    const location = await this.findOne(id);
    await this.prisma.location.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entityType: 'Location',
      entityId: id,
      action: 'delete',
      summary: `Standort "${location.name}" gelöscht`,
      userId: actorId,
    });
  }
}
