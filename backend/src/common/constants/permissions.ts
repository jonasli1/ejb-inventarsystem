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
  INVENTORY_CHANGE_INV_NUM: 'inventory.change_inv_num',
  LOCATIONS_MANAGE: 'locations.manage',
  LOANS_CREATE: 'loans.create',
  LOANS_VIEW: 'loans.view',
  LOANS_MANAGE: 'loans.manage',
  LOANS_SPEND: 'loans.spend',
  LOANS_ADMINISTER: 'loans.administer',
  REPORTS_VIEW: 'reports.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: { key: PermissionKey; description: string }[] = [
  {
    key: PERMISSIONS.USERS_MANAGE,
    description: 'Create, update, deactivate users',
  },
  {
    key: PERMISSIONS.USERS_RESET_PASSWORD,
    description: "Reset another user's password",
  },
  {
    key: PERMISSIONS.USERS_CHANGE_EMAIL,
    description: "Change another user's email address",
  },
  {
    key: PERMISSIONS.PERMISSIONS_ASSIGN,
    description: 'Assign permissions to roles',
  },
  {
    key: PERMISSIONS.ROLES_MANAGE,
    description: 'Create, update, delete roles',
  },
  {
    key: PERMISSIONS.GROUPS_MANAGE,
    description: 'Manage groups and manual memberships',
  },
  {
    key: PERMISSIONS.ORGANIZATIONS_MANAGE,
    description: 'Manage organizations and units',
  },
  {
    key: PERMISSIONS.ARTICLES_MANAGE,
    description: 'Manage catalog articles and categories',
  },
  {
    key: PERMISSIONS.INVENTORY_MANAGE,
    description:
      'Create, update, move inventory items (changing the inventory number itself requires inventory.change_inv_num)',
  },
  { key: PERMISSIONS.INVENTORY_VIEW, description: 'View inventory items' },
  {
    key: PERMISSIONS.INVENTORY_CHANGE_INV_NUM,
    description:
      "Change an inventory item's inventory number, independent of inventory.manage",
  },
  {
    key: PERMISSIONS.LOCATIONS_MANAGE,
    description: 'Manage locations and rooms',
  },
  {
    key: PERMISSIONS.LOANS_CREATE,
    description:
      'Request loans for items of any organization (not fixed-installed)',
  },
  {
    key: PERMISSIONS.LOANS_VIEW,
    description: 'View loans read-only, without returning or managing them',
  },
  {
    key: PERMISSIONS.LOANS_MANAGE,
    description:
      "Approve and directly create loans for organizations/units the user's group(s) are scoped to; issuing/returning requires loans.spend",
  },
  {
    key: PERMISSIONS.LOANS_SPEND,
    description:
      'Issue (hand out) and take back loan items for any organization, independent of loans.manage',
  },
  {
    key: PERMISSIONS.LOANS_ADMINISTER,
    description:
      'Approve, issue, return and directly create loans for any organization',
  },
  { key: PERMISSIONS.REPORTS_VIEW, description: 'View reports' },
  {
    key: PERMISSIONS.SETTINGS_MANAGE,
    description:
      'Configure and run system backups/restores and the email server',
  },
];
