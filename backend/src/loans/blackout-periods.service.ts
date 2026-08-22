import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBlackoutPeriodDto } from './dto/create-blackout-period.dto';

@Injectable()
export class BlackoutPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.loanBlackoutPeriod.findMany({
      orderBy: { startDate: 'asc' },
    });
  }

  async create(dto: CreateBlackoutPeriodDto, actorId?: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('endDate must not be before startDate.');
    }

    const period = await this.prisma.loanBlackoutPeriod.create({
      data: { startDate, endDate, reason: dto.reason, createdById: actorId },
    });

    await this.audit.log({
      entityType: 'LoanBlackoutPeriod',
      entityId: period.id,
      action: 'create',
      summary: `Sperrzeit für Ausleihen angelegt (${dto.startDate} – ${dto.endDate})`,
      userId: actorId,
    });

    return period;
  }

  async remove(id: string, actorId?: string) {
    const period = await this.prisma.loanBlackoutPeriod.findUnique({
      where: { id },
    });
    if (!period) throw new NotFoundException('Blackout period not found.');

    await this.prisma.loanBlackoutPeriod.delete({ where: { id } });

    await this.audit.log({
      entityType: 'LoanBlackoutPeriod',
      entityId: id,
      action: 'delete',
      summary: 'Sperrzeit für Ausleihen gelöscht',
      userId: actorId,
    });
  }
}
