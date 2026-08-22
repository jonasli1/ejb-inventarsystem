import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { BlackoutPeriodsService } from './blackout-periods.service';
import { CreateBlackoutPeriodDto } from './dto/create-blackout-period.dto';

@ApiTags('loans')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.LOANS_ADMINISTER)
@Controller('loans/blackout-periods')
export class BlackoutPeriodsController {
  constructor(private readonly blackoutPeriods: BlackoutPeriodsService) {}

  @Get()
  findAll() {
    return this.blackoutPeriods.findAll();
  }

  @Post()
  create(
    @Body() dto: CreateBlackoutPeriodDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.blackoutPeriods.create(dto, user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.blackoutPeriods.remove(id, user.id);
  }
}
