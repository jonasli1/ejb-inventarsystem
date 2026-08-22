import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupService } from './backup.service';

@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(private readonly backupService: BackupService) {}

  // Checked hourly rather than scheduled per-frequency, since the frequency
  // itself is user-configurable at runtime (see BackupService.isDue).
  @Cron('0 * * * *')
  async handleCron(): Promise<void> {
    try {
      await this.backupService.runScheduledBackupIfDue();
    } catch (err) {
      this.logger.error(
        'Scheduled backup check failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
