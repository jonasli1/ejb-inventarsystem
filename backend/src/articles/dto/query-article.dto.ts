import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArticleType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
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
}
