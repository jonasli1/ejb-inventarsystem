import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Boxes,
  Tags,
  Warehouse,
  ArrowRightLeft,
  CalendarDays,
  Building2,
  Users,
  ShieldCheck,
  UsersRound,
  History,
  DatabaseBackup,
  Mail,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { PERMISSIONS, type PermissionRequirement } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionRequirement;
  children?: NavItem[];
}

const SETTINGS_CHILDREN: NavItem[] = [
  {
    to: '/settings/general',
    label: 'Allgemein',
    icon: SlidersHorizontal,
    permission: PERMISSIONS.SETTINGS_MANAGE,
  },
  {
    to: '/settings/email',
    label: 'E-Mail-Server',
    icon: Mail,
    permission: PERMISSIONS.SETTINGS_MANAGE,
  },
  {
    to: '/settings/backup',
    label: 'Backup',
    icon: DatabaseBackup,
    permission: PERMISSIONS.SETTINGS_MANAGE,
  },
  { to: '/users', label: 'Benutzer', icon: Users, permission: PERMISSIONS.USERS_READ },
  { to: '/roles', label: 'Rollen', icon: ShieldCheck, permission: PERMISSIONS.ROLES_READ },
  { to: '/groups', label: 'Gruppen', icon: UsersRound, permission: PERMISSIONS.GROUPS_READ },
  {
    to: '/organizations',
    label: 'Organisationen',
    icon: Building2,
    permission: PERMISSIONS.ORGANIZATIONS_READ,
  },
];

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventar', icon: Boxes, permission: PERMISSIONS.INVENTORY_READ },
  { to: '/articles', label: 'Artikel', icon: Tags, permission: PERMISSIONS.ARTICLES_READ },
  { to: '/locations', label: 'Lager', icon: Warehouse, permission: PERMISSIONS.LOCATIONS_READ },
  {
    to: '/loans',
    label: 'Ausleihe',
    icon: ArrowRightLeft,
    permission: [
      PERMISSIONS.LOANS_CREATE,
      PERMISSIONS.LOANS_READ,
      PERMISSIONS.LOANS_MANAGE,
      PERMISSIONS.LOANS_SPEND,
      PERMISSIONS.LOANS_ADMINISTER,
    ],
  },
  {
    to: '/calendar',
    label: 'Kalender',
    icon: CalendarDays,
    permission: [
      PERMISSIONS.LOANS_READ,
      PERMISSIONS.LOANS_MANAGE,
      PERMISSIONS.LOANS_SPEND,
      PERMISSIONS.LOANS_ADMINISTER,
    ],
  },
  { to: '/activity', label: 'Aktivitäten', icon: History, permission: PERMISSIONS.INVENTORY_READ },
  {
    to: '/settings',
    label: 'Einstellungen',
    icon: Settings,
    permission: SETTINGS_CHILDREN.flatMap((c) =>
      Array.isArray(c.permission) ? c.permission : c.permission ? [c.permission] : [],
    ),
    children: SETTINGS_CHILDREN,
  },
];
