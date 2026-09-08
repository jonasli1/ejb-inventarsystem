import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { Audited } from '../audit/audited.decorator';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { QueryArticleDto } from './dto/query-article.dto';

@ApiTags('articles')
@ApiBearerAuth()
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @RequirePermissions(PERMISSIONS.ARTICLES_READ)
  @Get()
  findAll(@Query() query: QueryArticleDto) {
    return this.articlesService.findAll(query);
  }

  @RequirePermissions(PERMISSIONS.ARTICLES_READ)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.ARTICLES_READ)
  @Get(':id/units')
  getUnits(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.getUnits(id);
  }

  @Audited('Article', 'article')
  @RequirePermissions(PERMISSIONS.ARTICLES_CREATE)
  @Post()
  create(@Body() dto: CreateArticleDto) {
    return this.articlesService.create(dto);
  }

  @Audited('Article', 'article')
  @RequirePermissions(PERMISSIONS.ARTICLES_UPDATE)
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesService.update(id, dto);
  }

  @Audited('Article', 'article')
  @RequirePermissions(PERMISSIONS.ARTICLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.articlesService.remove(id);
  }
}
