import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exception';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

// Create/update/delete are audited automatically by AuditInterceptor (see
// the @Audited() decorator on LocationsController).
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (!location) throw new AppNotFoundException('Standort nicht gefunden.');
    return location;
  }

  async create(dto: CreateLocationDto) {
    return this.prisma.location.create({ data: dto });
  }

  async update(id: string, dto: UpdateLocationDto) {
    await this.findOne(id);
    return this.prisma.location.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.location.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
