import { PERMISSIONS, type PermissionKey } from '@/lib/permissions';

export interface PermissionInfo {
  label: string;
  description: string;
}

export interface PermissionGroup {
  title: string;
  permissions: PermissionKey[];
}

/** German label + explanation per permission key, for the Rollen page's info section and permission pickers. */
export const PERMISSION_INFO: Record<PermissionKey, PermissionInfo> = {
  [PERMISSIONS.ARTICLES_READ]: {
    label: 'Artikel ansehen',
    description: 'Artikel und Kategorien ansehen und durchsuchen.',
  },
  [PERMISSIONS.ARTICLES_CREATE]: {
    label: 'Artikel anlegen',
    description: 'Neue Artikel und Kategorien anlegen.',
  },
  [PERMISSIONS.ARTICLES_UPDATE]: {
    label: 'Artikel bearbeiten',
    description: 'Bestehende Artikel und Kategorien bearbeiten.',
  },
  [PERMISSIONS.ARTICLES_DELETE]: {
    label: 'Artikel löschen',
    description: 'Artikel und Kategorien löschen.',
  },

  [PERMISSIONS.INVENTORY_READ]: {
    label: 'Inventarobjekte ansehen',
    description: 'Inventarobjekte, ihre Bewegungshistorie und Zubehör-Zuordnungen ansehen.',
  },
  [PERMISSIONS.INVENTORY_CREATE]: {
    label: 'Inventarobjekte anlegen',
    description: 'Neue Inventarobjekte anlegen.',
  },
  [PERMISSIONS.INVENTORY_UPDATE]: {
    label: 'Inventarobjekte bearbeiten',
    description:
      'Inventarobjekte bearbeiten, verschieben und Zubehör zuordnen (Ausmustern erfordert zusätzlich "Inventarobjekte ausmustern", Ändern der Inventarnummer zusätzlich "Inventarnummer ändern").',
  },
  [PERMISSIONS.INVENTORY_DELETE]: {
    label: 'Inventarobjekte löschen',
    description: 'Inventarobjekte endgültig aus der Verwaltung entfernen.',
  },
  [PERMISSIONS.INVENTORY_RETIRE]: {
    label: 'Inventarobjekte ausmustern',
    description: 'Den Status eines Inventarobjekts auf "ausgemustert" setzen, unabhängig von "Inventarobjekte löschen".',
  },
  [PERMISSIONS.INVENTORY_CHANGE_INVENTORY_NUMBER]: {
    label: 'Inventarnummer ändern',
    description: 'Die Inventarnummer eines Inventarobjekts ändern, unabhängig von "Inventarobjekte bearbeiten".',
  },

  [PERMISSIONS.LOANS_CREATE]: {
    label: 'Ausleihen anlegen',
    description: 'Ausleihen für Objekte jeder Organisation beantragen (keine fest installierten Objekte).',
  },
  [PERMISSIONS.LOANS_READ]: {
    label: 'Ausleihen ansehen',
    description: 'Ausleihen nur lesend ansehen, ohne sie zurückzunehmen oder zu verwalten.',
  },
  [PERMISSIONS.LOANS_MANAGE]: {
    label: 'Ausleihen verwalten',
    description:
      'Ausleihen für Organisationen/Bereiche, denen die eigenen Gruppen zugeordnet sind, genehmigen und direkt anlegen (Ausgabe/Rücknahme erfordert zusätzlich "Ausleihen ausgeben/zurücknehmen").',
  },
  [PERMISSIONS.LOANS_SPEND]: {
    label: 'Ausleihen ausgeben/zurücknehmen',
    description: 'Objekte für jede Organisation ausgeben (verleihen) und zurücknehmen, unabhängig von "Ausleihen verwalten".',
  },
  [PERMISSIONS.LOANS_ADMINISTER]: {
    label: 'Ausleihen vollständig verwalten',
    description: 'Ausleihen für jede Organisation genehmigen, ausgeben, zurücknehmen und direkt anlegen.',
  },
  [PERMISSIONS.LOANS_DELETE]: {
    label: 'Ausleihen löschen',
    description: 'Ausleihen unwiderruflich aus der Datenbank löschen (nicht nur ausblenden).',
  },

  [PERMISSIONS.LOCATIONS_READ]: {
    label: 'Standorte ansehen',
    description: 'Standorte und Räume ansehen.',
  },
  [PERMISSIONS.LOCATIONS_CREATE]: {
    label: 'Standorte anlegen',
    description: 'Neue Standorte und Räume anlegen.',
  },
  [PERMISSIONS.LOCATIONS_UPDATE]: {
    label: 'Standorte bearbeiten',
    description: 'Standorte und Räume bearbeiten.',
  },
  [PERMISSIONS.LOCATIONS_DELETE]: {
    label: 'Standorte löschen',
    description: 'Standorte und Räume löschen.',
  },

  [PERMISSIONS.ORGANIZATIONS_READ]: {
    label: 'Organisationen ansehen',
    description: 'Organisationen und ihre Bereiche ansehen.',
  },
  [PERMISSIONS.ORGANIZATIONS_CREATE]: {
    label: 'Organisationen anlegen',
    description: 'Neue Organisationen und Bereiche anlegen.',
  },
  [PERMISSIONS.ORGANIZATIONS_UPDATE]: {
    label: 'Organisationen bearbeiten',
    description: 'Organisationen und ihre Bereiche bearbeiten.',
  },
  [PERMISSIONS.ORGANIZATIONS_DELETE]: {
    label: 'Organisationen löschen',
    description: 'Organisationen und ihre Bereiche löschen.',
  },

  [PERMISSIONS.USERS_READ]: {
    label: 'Personen ansehen',
    description: 'Benutzerkonten ansehen.',
  },
  [PERMISSIONS.USERS_CREATE]: {
    label: 'Personen anlegen',
    description: 'Neue Benutzerkonten anlegen.',
  },
  [PERMISSIONS.USERS_UPDATE]: {
    label: 'Personen bearbeiten',
    description: 'Benutzerkonten bearbeiten sowie Rollen- und Gruppenzuordnungen ändern.',
  },
  [PERMISSIONS.USERS_DELETE]: {
    label: 'Personen löschen',
    description: 'Benutzerkonten löschen.',
  },
  [PERMISSIONS.USERS_RESET_PASSWORD]: {
    label: 'Passwort zurücksetzen',
    description: 'Das Passwort einer anderen Person zurücksetzen.',
  },
  [PERMISSIONS.USERS_CHANGE_EMAIL]: {
    label: 'E-Mail-Adresse ändern',
    description: 'Die E-Mail-Adresse einer anderen Person ändern.',
  },

  [PERMISSIONS.ROLES_READ]: {
    label: 'Rollen ansehen',
    description: 'Rollen und ihre zugewiesenen Berechtigungen ansehen.',
  },
  [PERMISSIONS.ROLES_CREATE]: {
    label: 'Rollen anlegen',
    description: 'Neue Rollen anlegen.',
  },
  [PERMISSIONS.ROLES_UPDATE]: {
    label: 'Rollen bearbeiten',
    description: 'Rollen umbenennen oder ihre Beschreibung ändern.',
  },
  [PERMISSIONS.ROLES_DELETE]: {
    label: 'Rollen löschen',
    description: 'Rollen löschen.',
  },
  [PERMISSIONS.PERMISSIONS_ASSIGN]: {
    label: 'Berechtigungen zuweisen',
    description: 'Berechtigungen einer Rolle zuweisen oder entziehen.',
  },

  [PERMISSIONS.GROUPS_READ]: {
    label: 'Gruppen ansehen',
    description: 'Gruppen und ihre Mitgliedschaften ansehen.',
  },
  [PERMISSIONS.GROUPS_CREATE]: {
    label: 'Gruppen anlegen',
    description: 'Neue Gruppen anlegen.',
  },
  [PERMISSIONS.GROUPS_UPDATE]: {
    label: 'Gruppen bearbeiten',
    description: 'Gruppen bearbeiten, Rollen-Zuordnungen und Organisationsbereiche der Gruppe ändern.',
  },
  [PERMISSIONS.GROUPS_DELETE]: {
    label: 'Gruppen löschen',
    description: 'Gruppen löschen.',
  },

  [PERMISSIONS.SETTINGS_MANAGE]: {
    label: 'Einstellungen verwalten',
    description: 'Systemeinstellungen, E-Mail-Server sowie Backups konfigurieren und ausführen.',
  },
  [PERMISSIONS.REPORTS_VIEW]: {
    label: 'Berichte ansehen',
    description: 'Berichte und Exporte (PDF/Excel) einsehen.',
  },

  [PERMISSIONS.AUDIT_READ]: {
    label: 'Protokoll einsehen',
    description: 'Das Änderungsprotokoll (Audit-Log) nach Kategorie, Akteur, Zeitraum und Entität durchsuchen.',
  },
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Artikel',
    permissions: [
      PERMISSIONS.ARTICLES_READ,
      PERMISSIONS.ARTICLES_CREATE,
      PERMISSIONS.ARTICLES_UPDATE,
      PERMISSIONS.ARTICLES_DELETE,
    ],
  },
  {
    title: 'Inventarobjekte',
    permissions: [
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_CREATE,
      PERMISSIONS.INVENTORY_UPDATE,
      PERMISSIONS.INVENTORY_DELETE,
      PERMISSIONS.INVENTORY_RETIRE,
      PERMISSIONS.INVENTORY_CHANGE_INVENTORY_NUMBER,
    ],
  },
  {
    title: 'Ausleihen',
    permissions: [
      PERMISSIONS.LOANS_CREATE,
      PERMISSIONS.LOANS_READ,
      PERMISSIONS.LOANS_MANAGE,
      PERMISSIONS.LOANS_SPEND,
      PERMISSIONS.LOANS_ADMINISTER,
      PERMISSIONS.LOANS_DELETE,
    ],
  },
  {
    title: 'Standorte',
    permissions: [
      PERMISSIONS.LOCATIONS_READ,
      PERMISSIONS.LOCATIONS_CREATE,
      PERMISSIONS.LOCATIONS_UPDATE,
      PERMISSIONS.LOCATIONS_DELETE,
    ],
  },
  {
    title: 'Organisationen',
    permissions: [
      PERMISSIONS.ORGANIZATIONS_READ,
      PERMISSIONS.ORGANIZATIONS_CREATE,
      PERMISSIONS.ORGANIZATIONS_UPDATE,
      PERMISSIONS.ORGANIZATIONS_DELETE,
    ],
  },
  {
    title: 'Personen',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.USERS_RESET_PASSWORD,
      PERMISSIONS.USERS_CHANGE_EMAIL,
    ],
  },
  {
    title: 'Rollen & Rechte',
    permissions: [
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.ROLES_CREATE,
      PERMISSIONS.ROLES_UPDATE,
      PERMISSIONS.ROLES_DELETE,
      PERMISSIONS.PERMISSIONS_ASSIGN,
    ],
  },
  {
    title: 'Gruppen',
    permissions: [
      PERMISSIONS.GROUPS_READ,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.GROUPS_UPDATE,
      PERMISSIONS.GROUPS_DELETE,
    ],
  },
  {
    title: 'Einstellungen & Berichte',
    permissions: [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.REPORTS_VIEW],
  },
  {
    title: 'Protokoll',
    permissions: [PERMISSIONS.AUDIT_READ],
  },
];
