import { PartialType } from '@nestjs/swagger';
import { CreateStickerProfileDto } from './create-sticker-profile.dto';

export class UpdateStickerProfileDto extends PartialType(
  CreateStickerProfileDto,
) {}
