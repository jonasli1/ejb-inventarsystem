import { PartialType } from '@nestjs/swagger';
import { CreateOrganizationUnitDto } from './create-organization-unit.dto';

export class UpdateOrganizationUnitDto extends PartialType(
  CreateOrganizationUnitDto,
) {}
