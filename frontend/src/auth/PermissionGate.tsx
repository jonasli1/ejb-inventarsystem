import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './useAuth';
import { isPermitted, type PermissionRequirement } from '@/lib/permissions';

export function PermissionGate({
  permission,
  children,
}: {
  permission: PermissionRequirement;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();

  if (!isPermitted(hasPermission, permission)) {
    const permissionList = Array.isArray(permission) ? permission.join(', ') : permission;
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <ShieldAlert size={28} className="mb-1 text-muted" strokeWidth={1.5} />
        <p className="text-sm font-medium text-ink">Kein Zugriff</p>
        <p className="max-w-sm text-sm text-muted">
          Dir fehlt die Berechtigung <code className="rounded bg-black/5 px-1 py-0.5">{permissionList}</code> für
          diesen Bereich.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
