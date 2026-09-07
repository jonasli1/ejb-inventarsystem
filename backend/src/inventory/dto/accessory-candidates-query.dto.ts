import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AccessoryCandidatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive partial match on inventory number, serial number, article name/manufacturer/aliases, or notes.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
