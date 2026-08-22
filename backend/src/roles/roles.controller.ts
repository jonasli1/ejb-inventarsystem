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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.update(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.rolesService.remove(id, user.id);
  }

  @RequirePermissions(PERMISSIONS.PERMISSIONS_ASSIGN)
  @Post(':id/permissions')
  assignPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionDto,
  ) {
    return this.rolesService.assignPermission(id, dto.permissionId);
  }

  @RequirePermissions(PERMISSIONS.PERMISSIONS_ASSIGN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/permissions/:permissionId')
  async removePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
  ) {
    await this.rolesService.removePermission(id, permissionId);
  }
}
