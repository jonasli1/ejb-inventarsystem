import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Boxes, ArrowRightLeft, Tags, Building2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { PaginatedResult } from '@/lib/api-types';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader } from '@/components/layout/PageHeader';

function useCount(key: string, url: string, enabled: boolean) {
  return useQuery({
    queryKey: ['count', key],
    queryFn: async () => {
      const res = await api.get<PaginatedResult<unknown>>(url, { params: { pageSize: 1 } });
      return res.data.meta.total;
    },
    enabled,
  });
}

export function DashboardPage() {
  const { me, hasPermission } = useAuth();

  const canViewInventory = hasPermission(PERMISSIONS.INVENTORY_VIEW);

  const inventoryCount = useCount('inventory', '/inventory', canViewInventory);
  const articlesCount = useCount('articles', '/articles', canViewInventory);
  const organizationsCount = useCount('organizations', '/organizations', canViewInventory);
  const openLoansCount = useQuery({
    queryKey: ['count', 'loans-open'],
    queryFn: async () => {
      const counts = await Promise.all(
        (['requested', 'approved', 'issued'] as const).map(async (status) => {
          const res = await api.get<PaginatedResult<unknown>>('/loans', {
            params: { pageSize: 1, status },
          });
          return res.data.meta.total;
        }),
      );
      return counts.reduce((sum, n) => sum + n, 0);
    },
    enabled: hasPermission(PERMISSIONS.LOANS_MANAGE),
  });

  const stats = [
    {
      label: 'Inventarobjekte',
      value: inventoryCount.data,
      icon: Boxes,
      to: '/inventory',
      show: canViewInventory,
    },
    {
      label: 'Artikel im Katalog',
      value: articlesCount.data,
      icon: Tags,
      to: '/articles',
      show: canViewInventory,
    },
    {
      label: 'Offene Ausleihen',
      value: openLoansCount.data,
      icon: ArrowRightLeft,
      to: '/loans',
      show: hasPermission(PERMISSIONS.LOANS_MANAGE),
    },
    {
      label: 'Organisationen',
      value: organizationsCount.data,
      icon: Building2,
      to: '/organizations',
      show: canViewInventory,
    },
  ].filter((s) => s.show);

  return (
    <div>
      <PageHeader
        title={`Willkommen, ${me?.displayName ?? ''}`}
        description="Überblick über dein Inventar- und Lagerverwaltungssystem."
      />

      {stats.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Link key={stat.label} to={stat.to}>
              <Card className="transition-shadow hover:shadow-md">
                <CardBody className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <stat.icon size={19} />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink">{stat.value ?? '–'}</p>
                    <p className="text-sm text-muted">{stat.label}</p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-muted">
              Für dein Konto sind aktuell keine Übersichtsdaten verfügbar.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="mt-6">
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-ink">Dein Konto</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">E-Mail</dt>
                <dd className="text-ink">{me?.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Rollen</dt>
                <dd className="text-ink">{me?.roles.map((r) => r.name).join(', ') || '–'}</dd>
              </div>
              <div>
                <dt className="text-muted">Anmeldemethoden</dt>
                <dd className="text-ink">{me?.authMethods.join(', ')}</dd>
              </div>
              <div>
                <dt className="text-muted">Gruppen</dt>
                <dd className="text-ink">{me?.groups.map((g) => g.name).join(', ') || '–'}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
