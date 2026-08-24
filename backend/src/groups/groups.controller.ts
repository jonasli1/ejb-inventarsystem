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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateGroupOrganizationScopeDto } from './dto/create-group-organization-scope.dto';
import { AssignRoleDto } from '../users/dto/assign-role.dto';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.groupsService.findAll(query);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Post()
  create(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.groupsService.update(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.groupsService.remove(id, user.id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Get(':id/roles')
  listRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.listRoles(id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Post(':id/roles')
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.groupsService.assignRole(id, dto.roleId);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/roles/:roleId')
  async removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    await this.groupsService.removeRole(id, roleId);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Get(':id/organization-scopes')
  listOrganizationScopes(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.listOrganizationScopes(id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Post(':id/organization-scopes')
  addOrganizationScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGroupOrganizationScopeDto,
  ) {
    return this.groupsService.addOrganizationScope(id, dto);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/organization-scopes/:scopeId')
  async removeOrganizationScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scopeId', ParseUUIDPipe) scopeId: string,
  ) {
    await this.groupsService.removeOrganizationScope(id, scopeId);
  }
}
