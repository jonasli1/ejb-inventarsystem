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

/** A single required permission, or a list where holding any one suffices. */
export type PermissionRequirement = PermissionKey | PermissionKey[];

export function isPermitted(
  hasPermission: (key: PermissionKey) => boolean,
  permission?: PermissionRequirement,
): boolean {
  if (!permission) return true;
  return Array.isArray(permission) ? permission.some(hasPermission) : hasPermission(permission);
}
