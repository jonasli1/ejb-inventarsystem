import { Module } from '@nestjs/common';
import { StickerProfilesController } from './sticker-profiles.controller';
import { StickerProfilesService } from './sticker-profiles.service';

@Module({
  controllers: [StickerProfilesController],
  providers: [StickerProfilesService],
  exports: [StickerProfilesService],
})
export class StickerProfilesModule {}
