import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateNotificationTemplateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  subject: string;

  @ApiProperty({ description: 'HTML body with {{variable}} placeholders.' })
  @IsString()
  @MinLength(1)
  bodyHtml: string;
}
