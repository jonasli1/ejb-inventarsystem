import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { BlackoutPeriodsController } from './blackout-periods.controller';
import { BlackoutPeriodsService } from './blackout-periods.service';
import { LoanTemplatesController } from './loan-templates.controller';
import { LoanTemplatesService } from './loan-templates.service';

@Module({
  imports: [GroupsModule],
  // BlackoutPeriodsController/LoanTemplatesController must be registered
  // before LoansController: Nest binds routes to Express in this order, and
  // LoansController's `GET /loans/:id` would otherwise shadow their static
  // `GET /loans/blackout-periods` and `GET /loans/templates` routes.
  controllers: [
    BlackoutPeriodsController,
    LoanTemplatesController,
    LoansController,
  ],
  providers: [LoansService, BlackoutPeriodsService, LoanTemplatesService],
  exports: [LoansService],
})
export class LoansModule {}
