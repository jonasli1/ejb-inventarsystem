import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus, LayoutGrid, List as ListIcon, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useArticles, useCategories, useLocations, useOrganizations, useRooms } from '@/lib/reference-data';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { CursorResult, GroupedInventoryEntry, InventoryItem, InventoryStatus, PaginatedResult } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { findMatchedAlias } from '@/lib/matched-alias';
import { INVENTORY_STATUS_LABEL } from '@/lib/status-labels';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { VirtualList } from '@/components/ui/VirtualList';
import { downloadExport } from '@/lib/export';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { InventoryItemCreateModal } from './InventoryItemCreateModal';
import { InventoryDetailModal } from './InventoryDetailModal';
import { InventoryItemRow } from './InventoryItemRow';
import { FilterMenu, FILTER_TYPE_LABEL, type FilterValueOption, type InventoryFilterType } from './FilterMenu';

// This filter includes "borrowed" (unlike the manual status picker) since
// filtering by it is a legitimate read-only query.
const STATUS_OPTIONS: InventoryStatus[] = ['available', 'borrowed', 'maintenance', 'defect', 'retired', 'installed'];

const ROW_HEIGHT_ESTIMATE = 56;

function ColumnHeader() {
  return (
    <div className="hidden items-center gap-3 border-b border-border px-5 py-2.5 text-left text-xs font-medium text-muted sm:flex">
      <span className="w-9" />
      <span className="w-28">Inventarnummer</span>
      <span className="w-48">Artikel</span>
      <span className="w-32">Status</span>
      <span className="flex-1">Standort / Raum</span>
      <span className="w-40">Eigentümer</span>
    </div>
  );
}

export function InventoryPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.INVENTORY_CREATE);
  const canExport = hasPermission(PERMISSIONS.REPORTS_VIEW);

  const [grouped, setGrouped] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [locationId, setLocationId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [ownerOrganizationId, setOwnerOrganizationId] = useState('');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);

  const { data: locations } = useLocations();
  const { data: rooms } = useRooms(locationId || undefined);
  const { data: articles } = useArticles();
  const { data: categories } = useCategories();
  const { data: organizations } = useOrganizations();

  const suggestionsQuery = useQuery({
    queryKey: ['inventory', 'suggestions', debouncedSearch],
    queryFn: async () =>
      (
        await api.get<CursorResult<InventoryItem>>('/inventory', {
          params: { search: debouncedSearch, limit: 6 },
        })
      ).data.data,
    enabled: debouncedSearch.trim().length >= 2,
  });

  const commonFilters = {
    ...(status ? { status } : {}),
    ...(locationId ? { locationId } : {}),
    ...(roomId ? { roomId } : {}),
    ...(articleId ? { articleId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(ownerOrganizationId ? { ownerOrganizationId } : {}),
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
  };

  // Grouped view stays small/bounded by article count - classic offset
  // pagination, same as every other list in the app.
  const groupedQuery = useQuery({
    queryKey: ['inventory', 'grouped', page, commonFilters],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<GroupedInventoryEntry>>('/inventory', {
          params: { ...commonFilters, grouped: true, page, pageSize: 20 },
        })
      ).data,
    enabled: grouped,
  });

  // Flat view is the one expected to grow past 1M rows - keyset/cursor
  // pagination via infinite scroll, windowed rendering so only the rows
  // actually on screen are ever mounted.
  const flatQuery = useInfiniteQuery({
    queryKey: ['inventory', 'flat', commonFilters],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      (
        await api.get<CursorResult<InventoryItem>>('/inventory', {
          params: { ...commonFilters, cursor: pageParam, limit: 50 },
        })
      ).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !grouped,
  });
  const flatItems = useMemo(() => flatQuery.data?.pages.flatMap((p) => p.data) ?? [], [flatQuery.data]);

  const resetFilters = () => {
    setStatus('');
    setLocationId('');
    setRoomId('');
    setArticleId('');
    setCategoryId('');
    setOwnerOrganizationId('');
    setSearch('');
    setPage(1);
  };

  const removeFilter = (type: InventoryFilterType) => {
    if (type === 'status') setStatus('');
    else if (type === 'locationId') {
      setLocationId('');
      setRoomId('');
    } else if (type === 'roomId') setRoomId('');
    else if (type === 'articleId') setArticleId('');
    else if (type === 'categoryId') setCategoryId('');
    else if (type === 'ownerOrganizationId') setOwnerOrganizationId('');
    setPage(1);
  };

  const addFilter = (type: InventoryFilterType, value: string) => {
    if (type === 'status') setStatus(value);
    else if (type === 'locationId') {
      setLocationId(value);
      setRoomId('');
    } else if (type === 'roomId') setRoomId(value);
    else if (type === 'articleId') setArticleId(value);
    else if (type === 'categoryId') setCategoryId(value);
    else if (type === 'ownerOrganizationId') setOwnerOrganizationId(value);
    setPage(1);
  };

  const filterOptions: Record<InventoryFilterType, FilterValueOption[]> = {
    status: STATUS_OPTIONS.map((s) => ({ value: s, label: INVENTORY_STATUS_LABEL[s] })),
    locationId: (locations ?? []).map((l) => ({ value: l.id, label: l.name })),
    roomId: (rooms ?? []).map((r) => ({
      value: r.id,
      label: locationId ? r.name : `${r.name}${r.location ? ` (${r.location.name})` : ''}`,
    })),
    articleId: (articles ?? []).map((a) => ({ value: a.id, label: a.name })),
    categoryId: (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    ownerOrganizationId: (organizations ?? []).map((o) => ({ value: o.id, label: o.name })),
  };

  const activeFilters: { type: InventoryFilterType; label: string }[] = [
    status && { type: 'status' as const, label: INVENTORY_STATUS_LABEL[status as InventoryStatus] },
    locationId && {
      type: 'locationId' as const,
      label: locations?.find((l) => l.id === locationId)?.name ?? locationId,
    },
    roomId && { type: 'roomId' as const, label: rooms?.find((r) => r.id === roomId)?.name ?? roomId },
    articleId && {
      type: 'articleId' as const,
      label: articles?.find((a) => a.id === articleId)?.name ?? articleId,
    },
    categoryId && {
      type: 'categoryId' as const,
      label: categories?.find((c) => c.id === categoryId)?.name ?? categoryId,
    },
    ownerOrganizationId && {
      type: 'ownerOrganizationId' as const,
      label: organizations?.find((o) => o.id === ownerOrganizationId)?.name ?? ownerOrganizationId,
    },
  ].filter((f): f is { type: InventoryFilterType; label: string } => !!f);

  return (
    <div>
      <PageHeader
        title="Inventar"
        description="Bestand nach Standort, Raum, Status, Kategorie und Eigentümer durchsuchen."
        actions={
          canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Neues Objekt
            </Button>
          )
        }
      />

      <Card className="mb-4">
        <div className="p-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Suche nach Name, Inventarnummer, Hersteller, Kategorie, Eigentümer, Standort …"
              role="searchbox"
              name="inventory-search"
              autoComplete="off"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            />
            {searchFocused && debouncedSearch.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-md">
                {suggestionsQuery.isLoading ? (
                  <p className="px-3 py-2 text-sm text-muted">Suche …</p>
                ) : suggestionsQuery.data && suggestionsQuery.data.length > 0 ? (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {suggestionsQuery.data.map((item) => {
                      const matchedAlias = findMatchedAlias(item.article.aliases, debouncedSearch);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="flex w-full flex-col px-3 py-1.5 text-left text-sm hover:bg-canvas"
                          >
                            <span className="text-ink">
                              {item.article.name}{' '}
                              {item.inventoryNumber && (
                                <span className="font-mono text-xs text-muted">{item.inventoryNumber}</span>
                              )}
                            </span>
                            {matchedAlias && (
                              <Badge tone="purple" className="mt-0.5 self-start">
                                Alias: {matchedAlias}
                              </Badge>
                            )}
                            <span className="text-xs text-muted">
                              {item.ownerOrganization.name} · {item.location.name} ·{' '}
                              {INVENTORY_STATUS_LABEL[item.status]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-3 py-2 text-sm text-muted">Keine Treffer gefunden.</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FilterMenu options={filterOptions} onAdd={addFilter} />
            {activeFilters.map((f) => (
              <span
                key={f.type}
                className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-700"
              >
                {FILTER_TYPE_LABEL[f.type]}: {f.label}
                <button
                  type="button"
                  onClick={() => removeFilter(f.type)}
                  className="rounded-full p-0.5 hover:bg-brand-100"
                  title={`Filter "${FILTER_TYPE_LABEL[f.type]}" entfernen`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {activeFilters.length > 0 && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Alle Filter zurücksetzen
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {canExport && (
                <ExportButtons
                  onExport={(fmt) =>
                    downloadExport('/export/inventory', { ...commonFilters, format: fmt }, `Inventar.${fmt}`)
                  }
                />
              )}
              <div className="flex gap-1 rounded-lg border border-border p-0.5">
                <button
                  onClick={() => {
                    setGrouped(false);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
                    !grouped ? 'bg-brand-50 text-brand-700' : 'text-muted'
                  }`}
                >
                  <ListIcon size={15} />
                  Einzeln
                </button>
                <button
                  onClick={() => {
                    setGrouped(true);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
                    grouped ? 'bg-brand-50 text-brand-700' : 'text-muted'
                  }`}
                >
                  <LayoutGrid size={15} />
                  Gruppiert
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {grouped ? (
          groupedQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : !groupedQuery.data || groupedQuery.data.data.length === 0 ? (
            <EmptyState title="Keine Objekte gefunden" description="Passe die Filter an oder lege ein neues Objekt an." />
          ) : (
            <>
              <div className="divide-y divide-border">
                {groupedQuery.data.data.map((entry) => (
                  <div key={entry.article.id}>
                    <button
                      onClick={() =>
                        setExpandedArticle(expandedArticle === entry.article.id ? null : entry.article.id)
                      }
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-canvas"
                    >
                      {expandedArticle === entry.article.id ? (
                        <ChevronDown size={16} className="text-muted" />
                      ) : (
                        <ChevronRight size={16} className="text-muted" />
                      )}
                      <span className="font-medium text-ink">{entry.article.name}</span>
                      {findMatchedAlias(entry.article.aliases, debouncedSearch) && (
                        <Badge tone="purple">Alias: {findMatchedAlias(entry.article.aliases, debouncedSearch)}</Badge>
                      )}
                      <span className="text-sm text-muted">
                        {entry.stock.total} gesamt · {entry.stock.available} verfügbar · {entry.stock.borrowed}{' '}
                        ausgeliehen
                      </span>
                    </button>
                    {expandedArticle === entry.article.id && (
                      <div>
                        {entry.units.map((item) => (
                          <InventoryItemRow
                            key={item.id}
                            item={item}
                            onSelect={setSelectedItem}
                            nested
                            searchTerm={debouncedSearch}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Pagination
                page={groupedQuery.data.meta.page}
                totalPages={groupedQuery.data.meta.totalPages}
                total={groupedQuery.data.meta.total}
                onPageChange={setPage}
              />
            </>
          )
        ) : flatQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : flatItems.length === 0 ? (
          <EmptyState title="Keine Objekte gefunden" description="Passe die Filter an oder lege ein neues Objekt an." />
        ) : (
          <>
            <ColumnHeader />
            <VirtualList
              items={flatItems}
              estimateSize={ROW_HEIGHT_ESTIMATE}
              className="max-h-[65vh]"
              hasMore={flatQuery.hasNextPage}
              isFetchingMore={flatQuery.isFetchingNextPage}
              onEndReached={() => void flatQuery.fetchNextPage()}
              renderItem={(item) => (
                <InventoryItemRow item={item} onSelect={setSelectedItem} searchTerm={debouncedSearch} />
              )}
            />
          </>
        )}
      </Card>

      <InventoryItemCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {selectedItem && (
        <InventoryDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
