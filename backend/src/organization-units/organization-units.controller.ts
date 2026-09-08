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
import { OrganizationUnitsService } from './organization-units.service';
import { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import { UpdateOrganizationUnitDto } from './dto/update-organization-unit.dto';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations/:organizationId/units')
export class OrganizationUnitsController {
  constructor(private readonly unitsService: OrganizationUnitsService) {}

  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_READ)
  @Get()
  findAll(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.unitsService.findAll(organizationId);
  }

  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_READ)
  @Get(':id')
  findOne(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.unitsService.findOne(organizationId, id);
  }

  @Audited('OrganizationUnit', 'other')
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_CREATE)
  @Post()
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateOrganizationUnitDto,
  ) {
    return this.unitsService.create(organizationId, dto);
  }

  @Audited('OrganizationUnit', 'other')
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Put(':id')
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationUnitDto,
  ) {
    return this.unitsService.update(organizationId, id, dto);
  }

  @Audited('OrganizationUnit', 'other')
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.unitsService.remove(organizationId, id);
  }
}
