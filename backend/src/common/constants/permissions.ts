export const PERMISSIONS = {
  // Artikel
  ARTICLES_READ: 'articles.read',
  ARTICLES_CREATE: 'articles.create',
  ARTICLES_UPDATE: 'articles.update',
  ARTICLES_DELETE: 'articles.delete',

  // Inventarobjekte
  INVENTORY_READ: 'inventory.read',
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_UPDATE: 'inventory.update',
  INVENTORY_DELETE: 'inventory.delete',
  INVENTORY_RETIRE: 'inventory.retire',
  INVENTORY_CHANGE_INVENTORY_NUMBER: 'inventory.change_inventory_number',

  // Ausleihen
  LOANS_CREATE: 'loans.create',
  LOANS_READ: 'loans.read',
  LOANS_MANAGE: 'loans.manage',
  LOANS_SPEND: 'loans.spend',
  LOANS_ADMINISTER: 'loans.administer',
  LOANS_DELETE: 'loans.delete',

  // Standorte
  LOCATIONS_READ: 'locations.read',
  LOCATIONS_CREATE: 'locations.create',
  LOCATIONS_UPDATE: 'locations.update',
  LOCATIONS_DELETE: 'locations.delete',

  // Organisationen
  ORGANIZATIONS_READ: 'organizations.read',
  ORGANIZATIONS_CREATE: 'organizations.create',
  ORGANIZATIONS_UPDATE: 'organizations.update',
  ORGANIZATIONS_DELETE: 'organizations.delete',

  // Personen
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_CHANGE_EMAIL: 'users.change_email',

  // Rollen & Rechte
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  PERMISSIONS_ASSIGN: 'permissions.assign',

  // Gruppen
  GROUPS_READ: 'groups.read',
  GROUPS_CREATE: 'groups.create',
  GROUPS_UPDATE: 'groups.update',
  GROUPS_DELETE: 'groups.delete',

  // Einstellungen & Berichte
  SETTINGS_MANAGE: 'settings.manage',
  REPORTS_VIEW: 'reports.view',

  // Protokoll
  AUDIT_READ: 'audit.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: {
  key: PermissionKey;
  displayName: string;
  description: string;
}[] = [
  {
    key: PERMISSIONS.ARTICLES_READ,
    displayName: 'Artikel ansehen',
    description: 'Artikel und Kategorien ansehen und durchsuchen.',
  },
  {
    key: PERMISSIONS.ARTICLES_CREATE,
    displayName: 'Artikel anlegen',
    description: 'Neue Artikel und Kategorien anlegen.',
  },
  {
    key: PERMISSIONS.ARTICLES_UPDATE,
    displayName: 'Artikel bearbeiten',
    description: 'Bestehende Artikel und Kategorien bearbeiten.',
  },
  {
    key: PERMISSIONS.ARTICLES_DELETE,
    displayName: 'Artikel löschen',
    description: 'Artikel und Kategorien löschen.',
  },

  {
    key: PERMISSIONS.INVENTORY_READ,
    displayName: 'Inventarobjekte ansehen',
    description:
      'Inventarobjekte, ihre Bewegungshistorie und Zubehör-Zuordnungen ansehen.',
  },
  {
    key: PERMISSIONS.INVENTORY_CREATE,
    displayName: 'Inventarobjekte anlegen',
    description: 'Neue Inventarobjekte anlegen.',
  },
  {
    key: PERMISSIONS.INVENTORY_UPDATE,
    displayName: 'Inventarobjekte bearbeiten',
    description:
      'Inventarobjekte bearbeiten, verschieben und Zubehör zuordnen (Ausmustern erfordert zusätzlich "Inventarobjekte ausmustern", Ändern der Inventarnummer zusätzlich "Inventarnummer ändern").',
  },
  {
    key: PERMISSIONS.INVENTORY_DELETE,
    displayName: 'Inventarobjekte löschen',
    description: 'Inventarobjekte endgültig aus der Verwaltung entfernen.',
  },
  {
    key: PERMISSIONS.INVENTORY_RETIRE,
    displayName: 'Inventarobjekte ausmustern',
    description:
      'Den Status eines Inventarobjekts auf "ausgemustert" setzen, unabhängig von "Inventarobjekte löschen".',
  },
  {
    key: PERMISSIONS.INVENTORY_CHANGE_INVENTORY_NUMBER,
    displayName: 'Inventarnummer ändern',
    description:
      'Die Inventarnummer eines Inventarobjekts ändern, unabhängig von "Inventarobjekte bearbeiten".',
  },

  {
    key: PERMISSIONS.LOANS_CREATE,
    displayName: 'Ausleihen anlegen',
    description:
      'Ausleihen für Objekte jeder Organisation beantragen (keine fest installierten Objekte).',
  },
  {
    key: PERMISSIONS.LOANS_READ,
    displayName: 'Ausleihen ansehen',
    description:
      'Ausleihen nur lesend ansehen, ohne sie zurückzunehmen oder zu verwalten.',
  },
  {
    key: PERMISSIONS.LOANS_MANAGE,
    displayName: 'Ausleihen verwalten',
    description:
      'Ausleihen für Organisationen/Bereiche, denen die eigenen Gruppen zugeordnet sind, genehmigen und direkt anlegen (Ausgabe/Rücknahme erfordert zusätzlich "Ausleihen ausgeben/zurücknehmen").',
  },
  {
    key: PERMISSIONS.LOANS_SPEND,
    displayName: 'Ausleihen ausgeben/zurücknehmen',
    description:
      'Objekte für jede Organisation ausgeben (verleihen) und zurücknehmen, unabhängig von "Ausleihen verwalten".',
  },
  {
    key: PERMISSIONS.LOANS_ADMINISTER,
    displayName: 'Ausleihen vollständig verwalten',
    description:
      'Ausleihen für jede Organisation genehmigen, ausgeben, zurücknehmen und direkt anlegen.',
  },
  {
    key: PERMISSIONS.LOANS_DELETE,
    displayName: 'Ausleihen löschen',
    description:
      'Ausleihen unwiderruflich aus der Datenbank löschen (nicht nur ausblenden).',
  },

  {
    key: PERMISSIONS.LOCATIONS_READ,
    displayName: 'Standorte ansehen',
    description: 'Standorte und Räume ansehen.',
  },
  {
    key: PERMISSIONS.LOCATIONS_CREATE,
    displayName: 'Standorte anlegen',
    description: 'Neue Standorte und Räume anlegen.',
  },
  {
    key: PERMISSIONS.LOCATIONS_UPDATE,
    displayName: 'Standorte bearbeiten',
    description: 'Standorte und Räume bearbeiten.',
  },
  {
    key: PERMISSIONS.LOCATIONS_DELETE,
    displayName: 'Standorte löschen',
    description: 'Standorte und Räume löschen.',
  },

  {
    key: PERMISSIONS.ORGANIZATIONS_READ,
    displayName: 'Organisationen ansehen',
    description: 'Organisationen und ihre Bereiche ansehen.',
  },
  {
    key: PERMISSIONS.ORGANIZATIONS_CREATE,
    displayName: 'Organisationen anlegen',
    description: 'Neue Organisationen und Bereiche anlegen.',
  },
  {
    key: PERMISSIONS.ORGANIZATIONS_UPDATE,
    displayName: 'Organisationen bearbeiten',
    description: 'Organisationen und ihre Bereiche bearbeiten.',
  },
  {
    key: PERMISSIONS.ORGANIZATIONS_DELETE,
    displayName: 'Organisationen löschen',
    description: 'Organisationen und ihre Bereiche löschen.',
  },

  {
    key: PERMISSIONS.USERS_READ,
    displayName: 'Personen ansehen',
    description: 'Benutzerkonten ansehen.',
  },
  {
    key: PERMISSIONS.USERS_CREATE,
    displayName: 'Personen anlegen',
    description: 'Neue Benutzerkonten anlegen.',
  },
  {
    key: PERMISSIONS.USERS_UPDATE,
    displayName: 'Personen bearbeiten',
    description:
      'Benutzerkonten bearbeiten sowie Rollen- und Gruppenzuordnungen ändern.',
  },
  {
    key: PERMISSIONS.USERS_DELETE,
    displayName: 'Personen löschen',
    description: 'Benutzerkonten löschen.',
  },
  {
    key: PERMISSIONS.USERS_RESET_PASSWORD,
    displayName: 'Passwort zurücksetzen',
    description: 'Das Passwort einer anderen Person zurücksetzen.',
  },
  {
    key: PERMISSIONS.USERS_CHANGE_EMAIL,
    displayName: 'E-Mail-Adresse ändern',
    description: 'Die E-Mail-Adresse einer anderen Person ändern.',
  },

  {
    key: PERMISSIONS.ROLES_READ,
    displayName: 'Rollen ansehen',
    description: 'Rollen und ihre zugewiesenen Berechtigungen ansehen.',
  },
  {
    key: PERMISSIONS.ROLES_CREATE,
    displayName: 'Rollen anlegen',
    description: 'Neue Rollen anlegen.',
  },
  {
    key: PERMISSIONS.ROLES_UPDATE,
    displayName: 'Rollen bearbeiten',
    description: 'Rollen umbenennen oder ihre Beschreibung ändern.',
  },
  {
    key: PERMISSIONS.ROLES_DELETE,
    displayName: 'Rollen löschen',
    description: 'Rollen löschen.',
  },
  {
    key: PERMISSIONS.PERMISSIONS_ASSIGN,
    displayName: 'Berechtigungen zuweisen',
    description: 'Berechtigungen einer Rolle zuweisen oder entziehen.',
  },

  {
    key: PERMISSIONS.GROUPS_READ,
    displayName: 'Gruppen ansehen',
    description: 'Gruppen und ihre Mitgliedschaften ansehen.',
  },
  {
    key: PERMISSIONS.GROUPS_CREATE,
    displayName: 'Gruppen anlegen',
    description: 'Neue Gruppen anlegen.',
  },
  {
    key: PERMISSIONS.GROUPS_UPDATE,
    displayName: 'Gruppen bearbeiten',
    description:
      'Gruppen bearbeiten, Rollen-Zuordnungen und Organisationsbereiche der Gruppe ändern.',
  },
  {
    key: PERMISSIONS.GROUPS_DELETE,
    displayName: 'Gruppen löschen',
    description: 'Gruppen löschen.',
  },

  {
    key: PERMISSIONS.SETTINGS_MANAGE,
    displayName: 'Einstellungen verwalten',
    description:
      'Systemeinstellungen, E-Mail-Server sowie Backups konfigurieren und ausführen.',
  },
  {
    key: PERMISSIONS.REPORTS_VIEW,
    displayName: 'Berichte ansehen',
    description: 'Berichte und Exporte (PDF/Excel) einsehen.',
  },

  {
    key: PERMISSIONS.AUDIT_READ,
    displayName: 'Protokoll einsehen',
    description:
      'Das Änderungsprotokoll (Audit-Log) nach Kategorie, Akteur, Zeitraum und Entität durchsuchen.',
  },
];
