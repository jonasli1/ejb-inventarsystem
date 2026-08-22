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
} from 'lucide-react';
import { PERMISSIONS, type PermissionRequirement } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionRequirement;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventar', icon: Boxes, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: '/articles', label: 'Artikel', icon: Tags, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: '/locations', label: 'Lager', icon: Warehouse, permission: PERMISSIONS.INVENTORY_VIEW },
  {
    to: '/loans',
    label: 'Ausleihe',
    icon: ArrowRightLeft,
    permission: [
      PERMISSIONS.LOANS_CREATE,
      PERMISSIONS.LOANS_VIEW,
      PERMISSIONS.LOANS_MANAGE,
      PERMISSIONS.LOANS_ADMINISTER,
    ],
  },
  {
    to: '/calendar',
    label: 'Kalender',
    icon: CalendarDays,
    permission: [PERMISSIONS.LOANS_VIEW, PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER],
  },
  {
    to: '/organizations',
    label: 'Organisationen',
    icon: Building2,
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  { to: '/activity', label: 'Aktivitäten', icon: History, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: '/users', label: 'Benutzer', icon: Users, permission: PERMISSIONS.USERS_MANAGE },
  { to: '/roles', label: 'Rollen', icon: ShieldCheck, permission: PERMISSIONS.ROLES_MANAGE },
  { to: '/groups', label: 'Gruppen', icon: UsersRound, permission: PERMISSIONS.GROUPS_MANAGE },
  {
    to: '/settings/backup',
    label: 'Backup',
    icon: DatabaseBackup,
    permission: PERMISSIONS.SETTINGS_MANAGE,
  },
  {
    to: '/settings/email',
    label: 'E-Mail-Server',
    icon: Mail,
    permission: PERMISSIONS.SETTINGS_MANAGE,
  },
];
