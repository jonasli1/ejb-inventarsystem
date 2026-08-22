import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../constants/permissions';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const ANY_PERMISSIONS_KEY = 'anyPermissions';
/** Passes if the user holds at least one of the given permissions. */
export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
