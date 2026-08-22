import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { SftpUploaderService } from './sftp-uploader.service';
import { OneDriveUploaderService } from './onedrive-uploader.service';

@Module({
  controllers: [BackupController],
  providers: [
    BackupService,
    BackupSchedulerService,
    SftpUploaderService,
    OneDriveUploaderService,
  ],
  exports: [BackupService],
})
export class BackupModule {}
