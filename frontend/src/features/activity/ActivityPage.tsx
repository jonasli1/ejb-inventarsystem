import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useArticles } from '@/lib/reference-data';
import type { ActivityEntry, PaginatedResult, StockMovementType, User } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { MOVEMENT_TYPE_LABEL } from '@/lib/status-labels';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';

const TYPE_OPTIONS: StockMovementType[] = [
  'in',
  'out',
  'move',
  'adjust',
  'status_change',
  'condition_change',
];

export function ActivityPage() {
  const { hasPermission } = useAuth();
  const canFilterByUser = hasPermission(PERMISSIONS.USERS_MANAGE);

  const [page, setPage] = useState(1);
  const [articleId, setArticleId] = useState('');
  const [userId, setUserId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [type, setType] = useState<StockMovementType | ''>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const { data: articles } = useArticles();

  const usersQuery = useQuery({
    queryKey: ['users', 'all-for-filter'],
    queryFn: async () =>
      (await api.get<PaginatedResult<User>>('/users', { params: { pageSize: 100 } })).data.data,
    enabled: canFilterByUser,
  });

  const filters = {
    page,
    pageSize: 25,
    sortOrder,
    ...(articleId ? { articleId } : {}),
    ...(userId ? { userId } : {}),
    ...(loanId ? { loanId } : {}),
    ...(type ? { type } : {}),
  };

  const query = useQuery({
    queryKey: ['activity', filters],
    queryFn: async () =>
      (await api.get<PaginatedResult<ActivityEntry>>('/activity', { params: filters })).data,
  });

  const resetFilters = () => {
    setArticleId('');
    setUserId('');
    setLoanId('');
    setType('');
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Aktivitäten"
        description="Verlauf aller Änderungen, Erstellungen und Löschungen im System."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted">Artikel</label>
            <Select
              value={articleId}
              onChange={(e) => {
                setArticleId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Alle</option>
              {articles?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          {canFilterByUser && (
            <div className="min-w-[160px] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted">Benutzer</label>
              <Select
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Alle</option>
                {usersQuery.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="min-w-[150px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted">Art</label>
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value as StockMovementType | '');
                setPage(1);
              }}
            >
              <option value="">Alle</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {MOVEMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[150px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted">Ausleihe-ID</label>
            <Input
              placeholder="z. B. aus dem Link kopiert"
              value={loanId}
              onChange={(e) => {
                setLoanId(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Filter zurücksetzen
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
          >
            {sortOrder === 'desc' ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
            {sortOrder === 'desc' ? 'Neueste zuerst' : 'Älteste zuerst'}
          </Button>
        </div>
      </Card>

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.data.length === 0 ? (
          <EmptyState title="Keine Aktivitäten gefunden" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Datum</th>
                  <th className="px-5 py-2.5">Art</th>
                  <th className="px-5 py-2.5">Objekt</th>
                  <th className="px-5 py-2.5">Änderung</th>
                  <th className="px-5 py-2.5">Benutzer</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((entry) => (
                  <tr key={`${entry.source}-${entry.id}`} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-5 py-2.5 whitespace-nowrap text-muted">
                      {format(new Date(entry.createdAt), 'dd.MM.yyyy HH:mm')}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={entry.source === 'movement' ? 'blue' : 'purple'}>{entry.typeLabel}</Badge>
                        <span className="text-xs text-muted">{entry.entityType}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-ink">
                      {entry.inventoryItem ? (
                        <>
                          <span className="font-medium">{entry.inventoryItem.article.name}</span>
                          <span className="ml-1.5 font-mono text-xs text-muted">
                            {entry.inventoryItem.inventoryNumber}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted">{entry.entityId}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-muted">{entry.description}</td>
                    <td className="px-5 py-2.5 text-muted">{entry.user?.displayName ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.data && (
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}
