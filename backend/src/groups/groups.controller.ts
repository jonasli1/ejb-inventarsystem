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
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Audited } from '../audit/audited.decorator';
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

  @RequirePermissions(PERMISSIONS.GROUPS_READ)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.groupsService.findAll(query);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_READ)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.findOne(id);
  }

  @Audited('Group', 'group')
  @RequirePermissions(PERMISSIONS.GROUPS_CREATE)
  @Post()
  create(@Body() dto: CreateGroupDto) {
    return this.groupsService.create(dto);
  }

  @Audited('Group', 'group')
  @RequirePermissions(PERMISSIONS.GROUPS_UPDATE)
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Audited('Group', 'group')
  @RequirePermissions(PERMISSIONS.GROUPS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.groupsService.remove(id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_READ)
  @Get(':id/roles')
  listRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.listRoles(id);
  }

  // Sub-resource routes below intentionally have no @Audited(): their `:id`
  // param is the *group's* id, not the mapping/scope row being mutated, so
  // the interceptor's generic before/after lookup would describe the wrong
  // entity. These stay uncovered by the automatic audit, same as before
  // this change (no manual AuditService.log() existed for them either).

  @RequirePermissions(PERMISSIONS.GROUPS_UPDATE)
  @Post(':id/roles')
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.groupsService.assignRole(id, dto.roleId);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/roles/:roleId')
  async removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    await this.groupsService.removeRole(id, roleId);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_READ)
  @Get(':id/organization-scopes')
  listOrganizationScopes(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.listOrganizationScopes(id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_UPDATE)
  @Post(':id/organization-scopes')
  addOrganizationScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGroupOrganizationScopeDto,
  ) {
    return this.groupsService.addOrganizationScope(id, dto);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/organization-scopes/:scopeId')
  async removeOrganizationScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scopeId', ParseUUIDPipe) scopeId: string,
  ) {
    await this.groupsService.removeOrganizationScope(id, scopeId);
  }
}
