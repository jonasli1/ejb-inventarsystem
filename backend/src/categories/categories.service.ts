import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

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
    if (!category) throw new NotFoundException('Category not found.');
    return category;
  }

  private async assertParentValid(parentId?: string, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) {
      throw new BadRequestException('A category cannot be its own parent.');
    }
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, deletedAt: null },
    });
    if (!parent) throw new NotFoundException('Parent category not found.');
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
