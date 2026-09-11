import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ArticlesModule } from '../articles/articles.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [InventoryModule, ArticlesModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
