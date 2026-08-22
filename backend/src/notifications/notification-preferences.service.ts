import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectivePermissions } from '../common/utils/effective-permissions';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_BY_KEY,
} from './notification-events';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists every event the user is currently eligible for, with their current subscription status. */
  async listForUser(userId: string) {
    const permissions = await getEffectivePermissions(this.prisma, userId);
    const eligibleEvents = NOTIFICATION_EVENTS.filter((event) =>
      event.permissions.some((p) => permissions.has(p)),
    );

    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });
    const enabledKeys = new Set(prefs.map((p) => p.eventKey));

    return eligibleEvents.map((event) => ({
      key: event.key,
      label: event.label,
      enabled: enabledKeys.has(event.key),
    }));
  }

  async setPreference(
    userId: string,
    eventKey: string,
    enabled: boolean,
  ): Promise<void> {
    if (enabled) {
      const permissions = await getEffectivePermissions(this.prisma, userId);
      const event = NOTIFICATION_EVENTS.find((e) => e.key === eventKey);
      if (!event || !event.permissions.some((p) => permissions.has(p))) {
        return;
      }
      await this.prisma.notificationPreference.upsert({
        where: { userId_eventKey: { userId, eventKey } },
        update: {},
        create: { userId, eventKey },
      });
    } else {
      await this.prisma.notificationPreference.deleteMany({
        where: { userId, eventKey },
      });
    }
  }

  /** Removes preferences for events the user is no longer eligible for. Call after any permission change. */
  async pruneForUser(userId: string): Promise<void> {
    const permissions = await getEffectivePermissions(this.prisma, userId);
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });

    const staleIds = prefs
      .filter((pref) => {
        const event = NOTIFICATION_EVENT_BY_KEY.get(pref.eventKey);
        return !event || !event.permissions.some((p) => permissions.has(p));
      })
      .map((pref) => pref.id);

    if (staleIds.length > 0) {
      await this.prisma.notificationPreference.deleteMany({
        where: { id: { in: staleIds } },
      });
    }
  }

  async pruneForUsers(userIds: string[]): Promise<void> {
    await Promise.all(userIds.map((id) => this.pruneForUser(id)));
  }
}
