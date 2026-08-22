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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignGroupDto } from './dto/assign-group.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.usersService.remove(id, user.id);
  }

  @RequirePermissions(PERMISSIONS.USERS_RESET_PASSWORD)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.usersService.resetPassword(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.USERS_CHANGE_EMAIL)
  @Put(':id/email')
  changeEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEmailDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.changeEmail(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.PERMISSIONS_ASSIGN)
  @Post(':id/roles')
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.usersService.assignRole(id, dto.roleId);
  }

  @RequirePermissions(PERMISSIONS.PERMISSIONS_ASSIGN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/roles/:roleId')
  async removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    await this.usersService.removeRole(id, roleId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Get(':id/groups')
  listGroups(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.listGroups(id);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @Post(':id/groups')
  assignGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignGroupDto,
  ) {
    return this.usersService.assignGroup(id, dto.groupId);
  }

  @RequirePermissions(PERMISSIONS.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/groups/:groupId')
  async removeGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    await this.usersService.removeGroup(id, groupId);
  }
}
