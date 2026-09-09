import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './useAuth';
import { isPermitted, type PermissionKey, type PermissionRequirement } from '@/lib/permissions';
import { PERMISSION_INFO } from '@/lib/permission-labels';

export function PermissionGate({
  permission,
  children,
}: {
  permission: PermissionRequirement;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();

  if (!isPermitted(hasPermission, permission)) {
    const keys = Array.isArray(permission) ? permission : [permission];
    const labels = keys.map((key) => PERMISSION_INFO[key as PermissionKey]?.label ?? key).join(', ');
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <ShieldAlert size={28} className="mb-1 text-muted" strokeWidth={1.5} />
        <p className="text-sm font-medium text-ink">Kein Zugriff</p>
        <p className="max-w-sm text-sm text-muted">
          Dir fehlt die Berechtigung <span className="font-medium text-ink">{labels}</span> für diesen Bereich.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
