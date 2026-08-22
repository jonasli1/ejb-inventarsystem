import {
  PERMISSIONS,
  type PermissionKey,
} from '../common/constants/permissions';

export interface NotificationEventDef {
  key: string;
  label: string;
  /** The user must hold at least one of these permissions to opt into this event. */
  permissions: PermissionKey[];
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  {
    key: 'loan.requested',
    label: 'Neue Ausleihe wartet auf Genehmigung',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
  },
  {
    key: 'loan.approved',
    label: 'Ausleihe genehmigt',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
  },
  {
    key: 'loan.issued',
    label: 'Ausleihe ausgegeben',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
  },
  {
    key: 'loan.returned',
    label: 'Ausleihe vollständig zurückgegeben',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
  },
  {
    key: 'backup.failed',
    label: 'Automatisches Backup fehlgeschlagen',
    permissions: [PERMISSIONS.SETTINGS_MANAGE],
  },
];

export const NOTIFICATION_EVENT_BY_KEY = new Map(
  NOTIFICATION_EVENTS.map((e) => [e.key, e]),
);
