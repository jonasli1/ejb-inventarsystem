import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StreamableFile } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { ExportService, type ExportFile } from './export.service';
import {
  ExportArticlesQueryDto,
  ExportInventoryQueryDto,
  ExportQueryDto,
} from './dto/export-query.dto';

@ApiTags('export')
@ApiBearerAuth()
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @Get('loans/:id')
  async exportLoan(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exportService.exportLoan(
      id,
      query.format ?? 'xlsx',
    );
    return this.send(res, file);
  }

  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @Get('inventory')
  async exportInventory(
    @Query() query: ExportInventoryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exportService.exportInventory(
      query.groupBy,
      query.format ?? 'xlsx',
    );
    return this.send(res, file);
  }

  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @Get('inventory/:id')
  async exportInventoryItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exportService.exportInventoryItem(
      id,
      query.format ?? 'xlsx',
    );
    return this.send(res, file);
  }

  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @Get('articles')
  async exportArticles(
    @Query() query: ExportArticlesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exportService.exportArticles(
      query.articleIds,
      query.format ?? 'xlsx',
    );
    return this.send(res, file);
  }

  private send(res: Response, file: ExportFile): StreamableFile {
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
    });
    return new StreamableFile(file.buffer);
  }
}
