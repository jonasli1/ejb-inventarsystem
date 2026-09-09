import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useArticles } from '@/lib/reference-data';
import type { ActivityEntry, CursorResult, PaginatedResult, StockMovementType, User } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { VirtualList } from '@/components/ui/VirtualList';
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

const ROW_HEIGHT_ESTIMATE = 68;

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-2.5 hover:bg-canvas">
      <span className="w-36 shrink-0 whitespace-nowrap text-xs text-muted">
        {format(new Date(entry.createdAt), 'dd.MM.yyyy HH:mm')}
      </span>
      <span className="flex w-40 shrink-0 flex-wrap items-center gap-1.5">
        <Badge tone={entry.source === 'movement' ? 'blue' : 'purple'}>{entry.typeLabel}</Badge>
        <span className="text-xs text-muted">{entry.entityType}</span>
      </span>
      <span className="w-52 shrink-0 text-ink">
        {entry.inventoryItem ? (
          <>
            <span className="font-medium">{entry.inventoryItem.article.name}</span>
            {entry.inventoryItem.inventoryNumber && (
              <span className="ml-1.5 font-mono text-xs text-muted">{entry.inventoryItem.inventoryNumber}</span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted">{entry.entityId}</span>
        )}
      </span>
      <span className="min-w-[180px] flex-1 text-muted">{entry.description}</span>
      <span className="w-36 shrink-0 truncate text-muted">{entry.user?.displayName ?? '–'}</span>
    </div>
  );
}

export function ActivityPage() {
  const { hasPermission } = useAuth();
  const canFilterByUser = hasPermission(PERMISSIONS.USERS_READ);

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
    sortOrder,
    ...(articleId ? { articleId } : {}),
    ...(userId ? { userId } : {}),
    ...(loanId ? { loanId } : {}),
    ...(type ? { type } : {}),
  };

  const query = useInfiniteQuery({
    queryKey: ['activity', filters],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      (
        await api.get<CursorResult<ActivityEntry>>('/activity', {
          params: { ...filters, cursor: pageParam, limit: 30 },
        })
      ).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  const resetFilters = () => {
    setArticleId('');
    setUserId('');
    setLoanId('');
    setType('');
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
            <Select value={articleId} onChange={(e) => setArticleId(e.target.value)}>
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
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
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
            <Select value={type} onChange={(e) => setType(e.target.value as StockMovementType | '')}>
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
              autoComplete="off"
              value={loanId}
              onChange={(e) => setLoanId(e.target.value)}
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
        ) : entries.length === 0 ? (
          <EmptyState title="Keine Aktivitäten gefunden" />
        ) : (
          <>
            <div className="hidden items-center gap-x-4 border-b border-border px-5 py-2.5 text-left text-xs font-medium text-muted sm:flex">
              <span className="w-36 shrink-0">Datum</span>
              <span className="w-40 shrink-0">Art</span>
              <span className="w-52 shrink-0">Objekt</span>
              <span className="min-w-[180px] flex-1">Änderung</span>
              <span className="w-36 shrink-0">Benutzer</span>
            </div>
            <VirtualList
              items={entries}
              estimateSize={ROW_HEIGHT_ESTIMATE}
              className="max-h-[65vh]"
              hasMore={query.hasNextPage}
              isFetchingMore={query.isFetchingNextPage}
              onEndReached={() => void query.fetchNextPage()}
              renderItem={(entry) => <ActivityRow entry={entry} />}
            />
          </>
        )}
      </Card>
    </div>
  );
}
