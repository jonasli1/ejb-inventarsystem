import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationUnitsController } from '../organization-units/organization-units.controller';
import { OrganizationUnitsService } from '../organization-units/organization-units.service';

@Module({
  controllers: [OrganizationsController, OrganizationUnitsController],
  providers: [OrganizationsService, OrganizationUnitsService],
  exports: [OrganizationsService, OrganizationUnitsService],
})
export class OrganizationsModule {}
