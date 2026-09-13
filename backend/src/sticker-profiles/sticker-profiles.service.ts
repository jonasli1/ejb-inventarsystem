import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exception';
import { CreateStickerProfileDto } from './dto/create-sticker-profile.dto';
import { UpdateStickerProfileDto } from './dto/update-sticker-profile.dto';

// Create/update/delete are audited automatically by AuditInterceptor (see
// the @Audited() decorator on StickerProfilesController).
@Injectable()
export class StickerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.stickerProfile.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const profile = await this.prisma.stickerProfile.findUnique({
      where: { id },
    });
    if (!profile)
      throw new AppNotFoundException('Sticker-Profil nicht gefunden.');
    return profile;
  }

  async create(dto: CreateStickerProfileDto) {
    if (dto.isDefault) {
      return this.prisma.$transaction(async (tx) => {
        await tx.stickerProfile.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
        return tx.stickerProfile.create({ data: dto });
      });
    }
    return this.prisma.stickerProfile.create({ data: dto });
  }

  async update(id: string, dto: UpdateStickerProfileDto) {
    await this.findOne(id);
    if (dto.isDefault) {
      return this.prisma.$transaction(async (tx) => {
        await tx.stickerProfile.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
        return tx.stickerProfile.update({ where: { id }, data: dto });
      });
    }
    return this.prisma.stickerProfile.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.stickerProfile.delete({ where: { id } });
  }
}
