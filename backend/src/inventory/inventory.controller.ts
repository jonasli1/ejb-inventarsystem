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
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { MoveInventoryItemDto } from './dto/move-inventory-item.dto';
import { QueryInventoryItemDto } from './dto/query-inventory-item.dto';
import { AccessoryCandidatesQueryDto } from './dto/accessory-candidates-query.dto';
import { AssignAccessoryDto } from './dto/assign-accessory.dto';

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
    return this.inventoryService.findOneWithInherited(id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id/movements')
  getMovements(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getMovements(id);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id/accessory-candidates')
  getAccessoryCandidates(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AccessoryCandidatesQueryDto,
  ) {
    return this.inventoryService.getAccessoryCandidates(id, query);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  @Post()
  create(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.create(dto, user.id);
  }

  @RequireAnyPermission(
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.INVENTORY_CHANGE_INV_NUM,
  )
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.update(id, dto, user);
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
  @Put(':id/accessory')
  assignAccessory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignAccessoryDto,
  ) {
    return this.inventoryService.assignAccessory(id, dto.accessoryItemId);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  @Delete(':id/accessory/:accessoryId')
  removeAccessory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accessoryId', ParseUUIDPipe) accessoryId: string,
  ) {
    return this.inventoryService.removeAccessory(id, accessoryId);
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
