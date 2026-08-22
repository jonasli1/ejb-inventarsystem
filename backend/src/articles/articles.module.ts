import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { CategoriesController } from '../categories/categories.controller';
import { CategoriesService } from '../categories/categories.service';

@Module({
  controllers: [ArticlesController, CategoriesController],
  providers: [ArticlesService, CategoriesService],
  exports: [ArticlesService, CategoriesService],
})
export class ArticlesModule {}
