import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArticleType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryArticleDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ArticleType })
  @IsOptional()
  @IsEnum(ArticleType)
  type?: ArticleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Full-text search across name, manufacturer, description and category name.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
