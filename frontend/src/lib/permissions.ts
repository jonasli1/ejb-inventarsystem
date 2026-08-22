export const PERMISSIONS = {
  USERS_MANAGE: 'users.manage',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_CHANGE_EMAIL: 'users.change_email',
  PERMISSIONS_ASSIGN: 'permissions.assign',
  ROLES_MANAGE: 'roles.manage',
  GROUPS_MANAGE: 'groups.manage',
  ORGANIZATIONS_MANAGE: 'organizations.manage',
  ARTICLES_MANAGE: 'articles.manage',
  INVENTORY_MANAGE: 'inventory.manage',
  INVENTORY_VIEW: 'inventory.view',
  LOCATIONS_MANAGE: 'locations.manage',
  LOANS_CREATE: 'loans.create',
  LOANS_VIEW: 'loans.view',
  LOANS_MANAGE: 'loans.manage',
  LOANS_ADMINISTER: 'loans.administer',
  REPORTS_VIEW: 'reports.view',
  SETTINGS_MANAGE: 'settings.manage',
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
