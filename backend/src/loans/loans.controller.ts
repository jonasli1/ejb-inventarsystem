import {
  Body,
  Controller,
  Get,
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
import { RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { ReturnLoanDto } from './dto/return-loan.dto';
import { IssueLoanDto } from './dto/issue-loan.dto';
import { QueryLoanDto } from './dto/query-loan.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';

const VIEW_OR_ABOVE = [
  PERMISSIONS.LOANS_VIEW,
  PERMISSIONS.LOANS_MANAGE,
  PERMISSIONS.LOANS_ADMINISTER,
];
const MANAGE_OR_ABOVE = [
  PERMISSIONS.LOANS_MANAGE,
  PERMISSIONS.LOANS_ADMINISTER,
];
const CREATE_OR_ABOVE = [PERMISSIONS.LOANS_CREATE, ...MANAGE_OR_ABOVE];

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @RequireAnyPermission(...VIEW_OR_ABOVE)
  @Get()
  findAll(@Query() query: QueryLoanDto) {
    return this.loansService.findAll(query);
  }

  @RequireAnyPermission(...VIEW_OR_ABOVE)
  @Get('calendar')
  calendar(@Query() query: CalendarQueryDto) {
    return this.loansService.calendar(new Date(query.from), new Date(query.to));
  }

  @RequireAnyPermission(...VIEW_OR_ABOVE)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(id);
  }

  @RequireAnyPermission(...CREATE_OR_ABOVE)
  @Post()
  create(@Body() dto: CreateLoanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.loansService.create(dto, user);
  }

  @RequireAnyPermission(...MANAGE_OR_ABOVE)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.update(id, dto, user);
  }

  @RequireAnyPermission(...MANAGE_OR_ABOVE)
  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.approve(id, user);
  }

  @RequireAnyPermission(...MANAGE_OR_ABOVE)
  @Post(':id/issue')
  issue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.issue(id, dto, user);
  }

  @RequireAnyPermission(...MANAGE_OR_ABOVE)
  @Post(':id/reset-status')
  resetStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.resetStatus(id, user);
  }

  @RequireAnyPermission(...MANAGE_OR_ABOVE)
  @Post(':id/return')
  returnLoan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.returnLoan(id, dto, user);
  }
}
