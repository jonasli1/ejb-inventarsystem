import { PERMISSIONS, type PermissionKey } from '@/lib/permissions';

export interface PermissionInfo {
  label: string;
  description: string;
}

export interface PermissionGroup {
  title: string;
  permissions: PermissionKey[];
}

/** German label + explanation per permission key, for the Rollen page's info section. */
export const PERMISSION_INFO: Record<PermissionKey, PermissionInfo> = {
  [PERMISSIONS.USERS_MANAGE]: {
    label: 'Benutzer verwalten',
    description: 'Benutzer anlegen, bearbeiten und deaktivieren.',
  },
  [PERMISSIONS.USERS_RESET_PASSWORD]: {
    label: 'Passwort zurücksetzen',
    description: 'Das Passwort eines anderen Benutzers zurücksetzen.',
  },
  [PERMISSIONS.USERS_CHANGE_EMAIL]: {
    label: 'E-Mail-Adresse ändern',
    description: 'Die E-Mail-Adresse eines anderen Benutzers ändern.',
  },
  [PERMISSIONS.PERMISSIONS_ASSIGN]: {
    label: 'Berechtigungen zuweisen',
    description: 'Rollen Berechtigungen hinzufügen oder entziehen.',
  },
  [PERMISSIONS.ROLES_MANAGE]: {
    label: 'Rollen verwalten',
    description: 'Rollen anlegen, bearbeiten und löschen.',
  },
  [PERMISSIONS.GROUPS_MANAGE]: {
    label: 'Gruppen verwalten',
    description:
      'Gruppen anlegen, bearbeiten, Mitgliedschaften pflegen sowie Organisations-/Untereinheiten-Zuordnungen setzen.',
  },
  [PERMISSIONS.ORGANIZATIONS_MANAGE]: {
    label: 'Organisationen verwalten',
    description: 'Organisationen und deren Untereinheiten anlegen und bearbeiten.',
  },
  [PERMISSIONS.ARTICLES_MANAGE]: {
    label: 'Artikel verwalten',
    description: 'Artikel und Kategorien im Katalog anlegen und bearbeiten.',
  },
  [PERMISSIONS.INVENTORY_MANAGE]: {
    label: 'Inventar verwalten',
    description:
      'Inventarobjekte anlegen, bearbeiten und umlagern. Ändern der Inventarnummer selbst erfordert zusätzlich "Inventarnummer ändern".',
  },
  [PERMISSIONS.INVENTORY_VIEW]: {
    label: 'Inventar ansehen',
    description: 'Inventarobjekte einsehen (lesend).',
  },
  [PERMISSIONS.INVENTORY_CHANGE_INV_NUM]: {
    label: 'Inventarnummer ändern',
    description:
      'Die Inventarnummer eines Objekts ändern – unabhängig von der Berechtigung "Inventar verwalten".',
  },
  [PERMISSIONS.LOCATIONS_MANAGE]: {
    label: 'Lager verwalten',
    description: 'Standorte und Räume anlegen und bearbeiten.',
  },
  [PERMISSIONS.LOANS_CREATE]: {
    label: 'Ausleihen beantragen',
    description:
      'Ausleihen für Objekte jeder Organisation beantragen. Eine so erstellte Ausleihe muss stets genehmigt werden.',
  },
  [PERMISSIONS.LOANS_VIEW]: {
    label: 'Ausleihen ansehen',
    description: 'Ausleihen einsehen, ohne sie genehmigen, ausgeben oder zurücknehmen zu können.',
  },
  [PERMISSIONS.LOANS_MANAGE]: {
    label: 'Ausleihen genehmigen',
    description:
      'Ausleihen direkt anlegen sowie Objekte genehmigen, für die die eigene(n) Gruppe(n) der Organisation bzw. Untereinheit zugeordnet sind. Ausgabe und Rückgabe erfordern zusätzlich die Berechtigung "Ausleihen ausgeben".',
  },
  [PERMISSIONS.LOANS_SPEND]: {
    label: 'Ausleihen ausgeben',
    description:
      'Objekte jeder Organisation ausgeben und zurücknehmen – unabhängig von der Berechtigung "Ausleihen genehmigen".',
  },
  [PERMISSIONS.LOANS_ADMINISTER]: {
    label: 'Ausleihen uneingeschränkt verwalten',
    description:
      'Ausleihen jeder Organisation genehmigen, bearbeiten, ausgeben, zurücknehmen und direkt anlegen – ohne Organisations-/Untereinheiten-Einschränkung.',
  },
  [PERMISSIONS.REPORTS_VIEW]: {
    label: 'Berichte ansehen',
    description: 'Berichte und Exporte einsehen.',
  },
  [PERMISSIONS.SETTINGS_MANAGE]: {
    label: 'Einstellungen verwalten',
    description:
      'Allgemeine Einstellungen, E-Mail-Server und Backup konfigurieren sowie Backups ausführen.',
  },
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Benutzer & Zugriff',
    permissions: [
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.USERS_RESET_PASSWORD,
      PERMISSIONS.USERS_CHANGE_EMAIL,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.PERMISSIONS_ASSIGN,
      PERMISSIONS.GROUPS_MANAGE,
    ],
  },
  {
    title: 'Organisationen',
    permissions: [PERMISSIONS.ORGANIZATIONS_MANAGE],
  },
  {
    title: 'Inventar & Artikel',
    permissions: [
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.INVENTORY_CHANGE_INV_NUM,
      PERMISSIONS.ARTICLES_MANAGE,
      PERMISSIONS.LOCATIONS_MANAGE,
    ],
  },
  {
    title: 'Ausleihe',
    permissions: [
      PERMISSIONS.LOANS_CREATE,
      PERMISSIONS.LOANS_VIEW,
      PERMISSIONS.LOANS_MANAGE,
      PERMISSIONS.LOANS_SPEND,
      PERMISSIONS.LOANS_ADMINISTER,
    ],
  },
  {
    title: 'Berichte & Einstellungen',
    permissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.SETTINGS_MANAGE],
  },
];
