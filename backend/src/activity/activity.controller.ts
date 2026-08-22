import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { ActivityService } from './activity.service';
import { QueryActivityDto } from './dto/query-activity.dto';

@ApiTags('activity')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @Get()
  findAll(
    @Query() query: QueryActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const canViewLoans =
      user.permissions.includes(PERMISSIONS.LOANS_VIEW) ||
      user.permissions.includes(PERMISSIONS.LOANS_MANAGE) ||
      user.permissions.includes(PERMISSIONS.LOANS_ADMINISTER);
    return this.activityService.findAll(query, canViewLoans);
  }
}
