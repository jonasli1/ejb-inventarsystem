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
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { QueryArticleDto } from './dto/query-article.dto';

@ApiTags('articles')
@ApiBearerAuth()
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get()
  findAll(@Query() query: QueryArticleDto) {
    return this.articlesService.findAll(query);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id/units')
  getUnits(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.getUnits(id);
  }

  @RequirePermissions(PERMISSIONS.ARTICLES_MANAGE)
  @Post()
  create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.articlesService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ARTICLES_MANAGE)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.articlesService.update(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ARTICLES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.articlesService.remove(id, user.id);
  }
}
