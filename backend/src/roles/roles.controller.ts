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
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { Audited } from '../audit/audited.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Audited('Role', 'role')
  @RequirePermissions(PERMISSIONS.ROLES_CREATE)
  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Audited('Role', 'role')
  @RequirePermissions(PERMISSIONS.ROLES_UPDATE)
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Audited('Role', 'role')
  @RequirePermissions(PERMISSIONS.ROLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.rolesService.remove(id);
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
