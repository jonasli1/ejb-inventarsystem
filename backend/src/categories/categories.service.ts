import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppBadRequestException,
  AppNotFoundException,
} from '../common/exceptions/app.exception';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

// Create/update/delete are audited automatically by AuditInterceptor (see
// the @Audited() decorator on CategoriesController).
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw new AppNotFoundException('Kategorie nicht gefunden.');
    return category;
  }

  private async assertParentValid(parentId?: string, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) {
      throw new AppBadRequestException(
        'Eine Kategorie kann nicht ihre eigene übergeordnete Kategorie sein.',
        'CATEGORY_SELF_PARENT',
      );
    }
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, deletedAt: null },
    });
    if (!parent)
      throw new AppNotFoundException('Übergeordnete Kategorie nicht gefunden.');
  }

  async create(dto: CreateCategoryDto) {
    await this.assertParentValid(dto.parentId);
    return this.prisma.category.create({ data: dto });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    await this.assertParentValid(dto.parentId, id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
