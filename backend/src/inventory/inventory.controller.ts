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
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { MoveInventoryItemDto } from './dto/move-inventory-item.dto';
import { QueryInventoryItemDto } from './dto/query-inventory-item.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get()
  findAll(@Query() query: QueryInventoryItemDto) {
    return this.inventoryService.findAll(query);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id/movements')
  getMovements(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getMovements(id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id/last-loan-photos')
  getLastLoanPhotos(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getLastLoanPhotos(id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  @Post()
  create(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.update(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  @Post(':id/move')
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveInventoryItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.move(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.inventoryService.remove(id, user.id);
  }
}
