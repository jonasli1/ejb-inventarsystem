import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { StickerNumberFormat } from '../../generated/prisma/client';

export class CreateStickerProfileDto {
  @ApiProperty({ example: 'EJB Standard' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'EJB' })
  @IsString()
  @MinLength(1)
  praefix: string;

  @ApiPropertyOptional({ default: ' ' })
  @IsOptional()
  @IsString()
  trenner?: string = ' ';

  @ApiPropertyOptional({ type: [String], example: ['ejbe.de', 'Jugendwerk', 'Bernhausen', 'EjB'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ankerBegriffe?: string[] = [];

  @ApiProperty({ type: [String], example: ['EJB\\s*([0-9]{2,6})'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  extraktionsMuster: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ausschlussMuster?: string[] = [];

  @ApiPropertyOptional({ enum: StickerNumberFormat, default: StickerNumberFormat.verbatim })
  @IsOptional()
  @IsEnum(StickerNumberFormat)
  zahlenFormat?: StickerNumberFormat = StickerNumberFormat.verbatim;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  padLength?: number = 0;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}
