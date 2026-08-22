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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get()
  findAll() {
    return this.locationsService.findAll();
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.LOCATIONS_MANAGE)
  @Post()
  create(
    @Body() dto: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.LOCATIONS_MANAGE)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.update(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.LOCATIONS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.locationsService.remove(id, user.id);
  }
}
