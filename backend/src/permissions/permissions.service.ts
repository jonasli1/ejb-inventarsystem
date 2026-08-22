import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  async findOne(id: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });
    if (!permission) throw new NotFoundException('Permission not found.');
    return permission;
  }

  create(dto: CreatePermissionDto) {
    return this.prisma.permission.create({ data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.permission.delete({ where: { id } });
  }
}
