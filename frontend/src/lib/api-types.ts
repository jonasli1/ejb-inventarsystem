export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export type AuthProvider = 'local' | 'churchtools' | 'passkey';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  themePreference: ThemePreference;
  createdAt: string;
  authMethods: AuthProvider[];
  roles: { id: string; name: string }[];
  permissions: string[];
  groups: { id: string; name: string; source: 'churchtools' | 'manual' }[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  rolePermissions?: { permission: Permission }[];
}

export interface Permission {
  id: string;
  key: string;
  description: string | null;
}

export interface Group {
  id: string;
  name: string;
  externalRef: string | null;
  description: string | null;
  organizationScopes?: GroupOrganizationScope[];
}

export interface GroupOrganizationScope {
  id: string;
  groupId: string;
  organizationId: string;
  organizationUnitId: string | null;
  organization: Organization;
  organizationUnit: OrganizationUnit | null;
}

export interface UserGroupMembership {
  id: string;
  groupId: string;
  source: 'churchtools' | 'manual';
  group: Group;
}

export type RoleAssignSource = 'manual' | 'group';

export interface UserRoleAssignment {
  role: Role;
  source: RoleAssignSource;
}

export interface GroupRoleMapping {
  groupId: string;
  roleId: string;
  role: Role;
}

export interface Organization {
  id: string;
  name: string;
  units?: OrganizationUnit[];
}

export interface OrganizationUnit {
  id: string;
  organizationId: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export type ArticleType = 'UNIQUE' | 'BULK' | 'CONSUMABLE';

export interface ArticleStock {
  total: number;
  available: number;
  borrowed: number;
}

export interface Article {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category?: Category | null;
  type: ArticleType;
  unitOfMeasure: string | null;
  manufacturer: string | null;
  imageUrl: string | null;
  attributes: Record<string, unknown> | null;
  stock: ArticleStock;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  rooms?: Room[];
}

export interface Room {
  id: string;
  locationId: string;
  name: string;
  location?: Location;
}

export type InventoryStatus =
  | 'available'
  | 'borrowed'
  | 'maintenance'
  | 'defect'
  | 'retired'
  | 'installed';

export interface InventoryItem {
  id: string;
  articleId: string;
  locationId: string;
  roomId: string;
  ownerOrganizationId: string;
  ownerUnitId: string;
  inventoryNumber: string;
  status: InventoryStatus;
  serialNumber: string | null;
  conditionPercent: number | null;
  /** Serialized as a decimal string by the API, e.g. "149.99". */
  purchasePrice: string | null;
  purchaseDate: string | null;
  notes: string | null;
  article: Article;
  location: Location;
  room: Room;
  ownerOrganization: Organization;
  ownerUnit: OrganizationUnit;
}

export interface GroupedInventoryEntry {
  article: Article;
  stock: ArticleStock;
  units: InventoryItem[];
}

export type StockMovementType =
  | 'in'
  | 'out'
  | 'move'
  | 'adjust'
  | 'status_change'
  | 'condition_change';

export interface StockMovement {
  id: string;
  type: StockMovementType;
  fromRoomId: string | null;
  toRoomId: string | null;
  fromRoom?: Room | null;
  toRoom?: Room | null;
  oldStatus: InventoryStatus | null;
  newStatus: InventoryStatus | null;
  oldCondition: number | null;
  newCondition: number | null;
  note: string | null;
  createdAt: string;
  user: { id: string; displayName: string } | null;
  loanItem: { id: string; loanId: string } | null;
}

export type AuditEntityType =
  | 'User'
  | 'Article'
  | 'Loan'
  | 'Organization'
  | 'Location'
  | 'Role'
  | 'Group'
  | 'InventoryItem';

export interface ActivityEntry {
  id: string;
  source: 'movement' | 'audit';
  createdAt: string;
  typeLabel: string;
  entityType: AuditEntityType;
  entityId: string;
  description: string;
  inventoryItem: {
    id: string;
    inventoryNumber: string;
    article: { id: string; name: string };
  } | null;
  user: { id: string; displayName: string } | null;
}

export type LoanStatus = 'requested' | 'approved' | 'issued' | 'completed';
export type LoanSource = 'internal' | 'external';

export interface LoanItem {
  id: string;
  loanId: string;
  inventoryItemId: string;
  checkedOutCondition: number | null;
  returnedCondition: number | null;
  returnedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  approvedBy: { id: string; displayName: string } | null;
  inventoryItem: InventoryItem;
}

export interface Loan {
  id: string;
  borrowerPersonId: string | null;
  borrowerName: string | null;
  borrowerStreet: string | null;
  borrowerCity: string | null;
  borrowerEmail: string | null;
  borrowerPhone: string | null;
  lentByUserId: string;
  lentBy: { id: string; displayName: string; email: string };
  source: LoanSource;
  checkoutDate: string;
  dueDate: string | null;
  issuedAt: string | null;
  returnedAt: string | null;
  status: LoanStatus;
  notes: string | null;
  items: LoanItem[];
}

export interface CalendarLoanEntry {
  id: string;
  borrowerName: string | null;
  borrowerPersonId: string | null;
  status: LoanStatus;
  checkoutDate: string;
  dueDate: string | null;
  itemCount: number;
}

export interface LoanBlackoutPeriod {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface LoanTemplateItem {
  id: string;
  templateId: string;
  articleId: string;
  quantity: number;
  article: Article;
}

export interface LoanTemplate {
  id: string;
  name: string;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  items: LoanTemplateItem[];
}

// -----------------------------------------------------------------------
// Attachments
// -----------------------------------------------------------------------

export type AttachmentEntityType = 'article' | 'inventoryItem' | 'loanItem';
export type AttachmentCategory =
  | 'image'
  | 'document'
  | 'inspection'
  | 'checkoutPhoto'
  | 'returnPhoto';

export interface Attachment {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  category: AttachmentCategory;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { id: string; displayName: string } | null;
}

// -----------------------------------------------------------------------
// Backup
// -----------------------------------------------------------------------

export type BackupFrequency = 'daily' | 'weekly' | 'monthly';
export type BackupDestinationType = 'sftp' | 'onedrive';

export interface BackupConfig {
  enabled: boolean;
  frequency: BackupFrequency;
  destinationType: BackupDestinationType | null;
  sftpHost: string | null;
  sftpPort: number | null;
  sftpUsername: string | null;
  sftpPasswordSet: boolean;
  sftpRemotePath: string | null;
  onedriveConnected: boolean;
  onedriveFolderPath: string | null;
  onedriveConfigured: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
}

export interface EmailConfig {
  enabled: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  passwordSet: boolean;
  fromAddress: string | null;
  fromName: string | null;
}

export interface AppSettingsConfig {
  displayName: string;
  churchToolsEnabled: boolean;
  passkeyEnabled: boolean;
  logoDataUrl: string | null;
}

export interface PublicAppSettingsConfig extends AppSettingsConfig {
  churchToolsAvailable: boolean;
  passkeyAvailable: boolean;
}

export interface NotificationPreferenceEntry {
  key: string;
  label: string;
  enabled: boolean;
}
