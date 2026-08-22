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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { LoanTemplatesService } from './loan-templates.service';
import { CreateLoanTemplateDto } from './dto/create-loan-template.dto';

@ApiTags('loans')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.LOANS_ADMINISTER)
@Controller('loans/templates')
export class LoanTemplatesController {
  constructor(private readonly loanTemplates: LoanTemplatesService) {}

  @Get()
  findAll() {
    return this.loanTemplates.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loanTemplates.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateLoanTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loanTemplates.create(dto, user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.loanTemplates.remove(id, user.id);
  }
}
