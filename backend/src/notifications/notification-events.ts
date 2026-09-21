import {
  PERMISSIONS,
  type PermissionKey,
} from '../common/constants/permissions';

export interface TemplateVariable {
  key: string;
  description: string;
}

// Available in every template's subject/body, on top of the event-specific
// variables below - substituted per recipient (recipientName) or globally
// (appName) by EmailService.
export const UNIVERSAL_TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: 'recipientName', description: 'Anzeigename der Empfängerin/des Empfängers' },
  { key: 'appName', description: 'Name der Anwendung (aus den Einstellungen)' },
];

export interface NotificationEventDef {
  key: string;
  label: string;
  /** The user must hold at least one of these permissions to opt into this event. */
  permissions: PermissionKey[];
  /**
   * Direct/system emails (e.g. password reset) are sent to one specific
   * address, not fanned out to every permission-holder, and are never
   * subject to per-user opt-out preferences.
   */
  system?: boolean;
  variables: TemplateVariable[];
  defaultSubject: string;
  /** HTML with {{variable}} placeholders - see `variables` and UNIVERSAL_TEMPLATE_VARIABLES. */
  defaultBodyHtml: string;
}

// Shared by every loan.* event below - describes the richer loan context on
// top of borrowerName/itemCount (subject, address, contact, item lists,
// creator, dates, a link back into the app).
const LOAN_CONTEXT_VARIABLES: TemplateVariable[] = [
  { key: 'subject', description: 'Betreff der Ausleihe' },
  { key: 'borrowerStreet', description: 'Straße der ausleihenden Person' },
  { key: 'borrowerCity', description: 'Ort der ausleihenden Person' },
  { key: 'borrowerEmail', description: 'E-Mail-Adresse der ausleihenden Person' },
  { key: 'borrowerPhone', description: 'Telefonnummer der ausleihenden Person' },
  { key: 'itemList', description: 'Auflistung aller Objekte der Ausleihe' },
  { key: 'itemListShort', description: 'Auflistung der ersten bis zu 5 Objekte der Ausleihe' },
  { key: 'createdBy', description: 'Ersteller/in der Ausleihe' },
  { key: 'startDate', description: 'Start-/Ausleihdatum' },
  { key: 'endDate', description: 'End-/Rückgabedatum' },
  { key: 'loansUrl', description: 'Link zur Ausleihen-Übersicht' },
];

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  {
    key: 'loan.requested',
    label: 'Neue Ausleihe wartet auf Genehmigung',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
    variables: [
      { key: 'borrowerName', description: 'Name der ausleihenden Person' },
      { key: 'itemCount', description: 'Anzahl der Objekte in der Ausleihe' },
      ...LOAN_CONTEXT_VARIABLES,
    ],
    defaultSubject: 'Neue Ausleihe wartet auf Genehmigung',
    defaultBodyHtml:
      '<p>Hallo {{recipientName}},</p><p>eine neue Ausleihe für <strong>{{borrowerName}}</strong> mit {{itemCount}} Objekt(en) wartet auf Ihre Genehmigung.</p>',
  },
  {
    key: 'loan.approved',
    label: 'Ausleihe genehmigt',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
    variables: [
      { key: 'borrowerName', description: 'Name der ausleihenden Person' },
      ...LOAN_CONTEXT_VARIABLES,
    ],
    defaultSubject: 'Ausleihe genehmigt',
    defaultBodyHtml:
      '<p>Hallo {{recipientName}},</p><p>die Ausleihe für <strong>{{borrowerName}}</strong> wurde genehmigt.</p>',
  },
  {
    key: 'loan.issued',
    label: 'Ausleihe ausgegeben',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
    variables: [
      { key: 'borrowerName', description: 'Name der ausleihenden Person' },
      ...LOAN_CONTEXT_VARIABLES,
    ],
    defaultSubject: 'Ausleihe ausgegeben',
    defaultBodyHtml:
      '<p>Hallo {{recipientName}},</p><p>die Ausleihe für <strong>{{borrowerName}}</strong> wurde ausgegeben.</p>',
  },
  {
    key: 'loan.returned',
    label: 'Ausleihe vollständig zurückgegeben',
    permissions: [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
    variables: [
      { key: 'borrowerName', description: 'Name der ausleihenden Person' },
      ...LOAN_CONTEXT_VARIABLES,
    ],
    defaultSubject: 'Ausleihe vollständig zurückgegeben',
    defaultBodyHtml:
      '<p>Hallo {{recipientName}},</p><p>die Ausleihe für <strong>{{borrowerName}}</strong> wurde vollständig zurückgegeben.</p>',
  },
  {
    key: 'backup.failed',
    label: 'Automatisches Backup fehlgeschlagen',
    permissions: [PERMISSIONS.SETTINGS_MANAGE],
    variables: [
      { key: 'errorMessage', description: 'Fehlermeldung des fehlgeschlagenen Backups' },
    ],
    defaultSubject: 'Automatisches Backup fehlgeschlagen',
    defaultBodyHtml:
      '<p>Hallo {{recipientName}},</p><p>das automatische Backup ist fehlgeschlagen:</p><p><strong>{{errorMessage}}</strong></p>',
  },
  {
    key: 'password.reset',
    label: 'Passwort zurücksetzen',
    permissions: [],
    system: true,
    variables: [
      { key: 'resetUrl', description: 'Link zum Zurücksetzen des Passworts' },
    ],
    defaultSubject: 'Passwort zurücksetzen',
    defaultBodyHtml:
      '<p>Hallo {{recipientName}},</p><p>klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen (gültig für 1 Stunde):</p><p><a href="{{resetUrl}}" style="color:#2563eb;">Passwort zurücksetzen</a></p><p>Wenn Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren - Ihr Passwort bleibt unverändert.</p>',
  },
];

export const NOTIFICATION_EVENT_BY_KEY = new Map(
  NOTIFICATION_EVENTS.map((e) => [e.key, e]),
);
