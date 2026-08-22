import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(locationId?: string) {
    const where: Prisma.RoomWhereInput = {
      deletedAt: null,
      ...(locationId ? { locationId } : {}),
    };
    return this.prisma.room.findMany({
      where,
      include: { location: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
      include: { location: true },
    });
    if (!room) throw new NotFoundException('Room not found.');
    return room;
  }

  private async assertLocationExists(locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, deletedAt: null },
    });
    if (!location) throw new NotFoundException('Location not found.');
  }

  async create(dto: CreateRoomDto) {
    await this.assertLocationExists(dto.locationId);
    return this.prisma.room.create({ data: dto });
  }

  async update(id: string, dto: UpdateRoomDto) {
    await this.findOne(id);
    if (dto.locationId) {
      await this.assertLocationExists(dto.locationId);
    }
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.room.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
