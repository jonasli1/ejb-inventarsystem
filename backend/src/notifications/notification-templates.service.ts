import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exception';
import {
  NOTIFICATION_EVENT_BY_KEY,
  NOTIFICATION_EVENTS,
  UNIVERSAL_TEMPLATE_VARIABLES,
} from './notification-events';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';

@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every event + its current (custom or default) template, for the settings UI. */
  async findAll() {
    const rows = await this.prisma.notificationTemplate.findMany();
    const byKey = new Map(rows.map((r) => [r.eventKey, r]));
    return NOTIFICATION_EVENTS.map((event) => this.toDto(event, byKey.get(event.key)));
  }

  async findOne(eventKey: string) {
    const event = NOTIFICATION_EVENT_BY_KEY.get(eventKey);
    if (!event) {
      throw new AppNotFoundException('Unbekannter Benachrichtigungstyp.');
    }
    const row = await this.prisma.notificationTemplate.findUnique({
      where: { eventKey },
    });
    return this.toDto(event, row ?? undefined);
  }

  async update(eventKey: string, dto: UpdateNotificationTemplateDto) {
    const event = NOTIFICATION_EVENT_BY_KEY.get(eventKey);
    if (!event) {
      throw new AppNotFoundException('Unbekannter Benachrichtigungstyp.');
    }
    await this.prisma.notificationTemplate.upsert({
      where: { eventKey },
      update: { subject: dto.subject, bodyHtml: dto.bodyHtml },
      create: { eventKey, subject: dto.subject, bodyHtml: dto.bodyHtml },
    });
    return this.findOne(eventKey);
  }

  /** Resets a template back to its built-in default by deleting the customization row. */
  async reset(eventKey: string) {
    const event = NOTIFICATION_EVENT_BY_KEY.get(eventKey);
    if (!event) {
      throw new AppNotFoundException('Unbekannter Benachrichtigungstyp.');
    }
    await this.prisma.notificationTemplate
      .delete({ where: { eventKey } })
      .catch(() => undefined);
    return this.findOne(eventKey);
  }

  private toDto(
    event: (typeof NOTIFICATION_EVENTS)[number],
    row: { subject: string; bodyHtml: string; updatedAt: Date } | undefined,
  ) {
    return {
      eventKey: event.key,
      label: event.label,
      variables: [...UNIVERSAL_TEMPLATE_VARIABLES, ...event.variables],
      subject: row?.subject ?? event.defaultSubject,
      bodyHtml: row?.bodyHtml ?? event.defaultBodyHtml,
      isCustomized: !!row,
      updatedAt: row?.updatedAt ?? null,
    };
  }
}
