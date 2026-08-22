import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, LayoutGrid, List as ListIcon, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useArticles, useCategories, useLocations, useOrganizations, useRooms } from '@/lib/reference-data';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { GroupedInventoryEntry, InventoryItem, InventoryStatus, PaginatedResult } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { InventoryStatusBadge } from '@/components/ui/Badge';
import { INVENTORY_STATUS_LABEL } from '@/lib/status-labels';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { downloadExport } from '@/lib/export';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { InventoryItemCreateModal } from './InventoryItemCreateModal';
import { InventoryDetailModal } from './InventoryDetailModal';
import { FilterMenu, FILTER_TYPE_LABEL, type FilterValueOption, type InventoryFilterType } from './FilterMenu';

// This filter includes "borrowed" (unlike the manual status picker) since
// filtering by it is a legitimate read-only query.
const STATUS_OPTIONS: InventoryStatus[] = ['available', 'borrowed', 'maintenance', 'defect', 'retired', 'installed'];

export function InventoryPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.INVENTORY_MANAGE);
  const canExport = hasPermission(PERMISSIONS.REPORTS_VIEW);

  const [exportGroupBy, setExportGroupBy] = useState<'' | 'owner' | 'location'>('');
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
        await api.get<PaginatedResult<InventoryItem>>('/inventory', {
          params: { search: debouncedSearch, pageSize: 6 },
        })
      ).data.data,
    enabled: debouncedSearch.trim().length >= 2,
  });

  const filters = {
    page,
    pageSize: 20,
    grouped,
    ...(status ? { status } : {}),
    ...(locationId ? { locationId } : {}),
    ...(roomId ? { roomId } : {}),
    ...(articleId ? { articleId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(ownerOrganizationId ? { ownerOrganizationId } : {}),
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
  };

  const query = useQuery({
    queryKey: ['inventory', filters],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<InventoryItem | GroupedInventoryEntry>>('/inventory', {
          params: filters,
        })
      ).data,
  });

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
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <>
                <div className="w-52">
                  <Select
                    value={exportGroupBy}
                    onChange={(e) => setExportGroupBy(e.target.value as '' | 'owner' | 'location')}
                  >
                    <option value="">Export: keine Gruppierung</option>
                    <option value="owner">Export: nach Eigentümer</option>
                    <option value="location">Export: nach Standort</option>
                  </Select>
                </div>
                <ExportButtons
                  onExport={(fmt) =>
                    downloadExport(
                      '/export/inventory',
                      { format: fmt, groupBy: exportGroupBy || undefined },
                      `Inventar.${fmt}`,
                    )
                  }
                />
              </>
            )}
            {canManage && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Neues Objekt
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-4">
        <div className="p-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Suche nach Name, Inventarnummer, Hersteller, Kategorie, Eigentümer, Standort …"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            />
            {searchFocused && debouncedSearch.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-white shadow-md">
                {suggestionsQuery.isLoading ? (
                  <p className="px-3 py-2 text-sm text-muted">Suche …</p>
                ) : suggestionsQuery.data && suggestionsQuery.data.length > 0 ? (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {suggestionsQuery.data.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="flex w-full flex-col px-3 py-1.5 text-left text-sm hover:bg-canvas"
                        >
                          <span className="text-ink">
                            {item.article.name}{' '}
                            <span className="font-mono text-xs text-muted">{item.inventoryNumber}</span>
                          </span>
                          <span className="text-xs text-muted">
                            {item.ownerOrganization.name} · {item.location.name} ·{' '}
                            {INVENTORY_STATUS_LABEL[item.status]}
                          </span>
                        </button>
                      </li>
                    ))}
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

            <div className="ml-auto flex gap-1 rounded-lg border border-border p-0.5">
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
      </Card>

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.data.length === 0 ? (
          <EmptyState title="Keine Objekte gefunden" description="Passe die Filter an oder lege ein neues Objekt an." />
        ) : grouped ? (
          <div className="divide-y divide-border">
            {(query.data.data as GroupedInventoryEntry[]).map((entry) => (
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
                  <span className="text-sm text-muted">
                    {entry.stock.total} gesamt · {entry.stock.available} verfügbar · {entry.stock.borrowed}{' '}
                    ausgeliehen
                  </span>
                </button>
                {expandedArticle === entry.article.id && (
                  <ItemsTable items={entry.units} onSelect={setSelectedItem} nested />
                )}
              </div>
            ))}
          </div>
        ) : (
          <ItemsTable items={query.data.data as InventoryItem[]} onSelect={setSelectedItem} />
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

      <InventoryItemCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {selectedItem && (
        <InventoryDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

function ItemsTable({
  items,
  onSelect,
  nested,
}: {
  items: InventoryItem[];
  onSelect: (item: InventoryItem) => void;
  nested?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {!nested && (
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted">
              <th className="px-5 py-2.5">Inventarnummer</th>
              <th className="px-5 py-2.5">Artikel</th>
              <th className="px-5 py-2.5">Status</th>
              <th className="px-5 py-2.5">Standort / Raum</th>
              <th className="px-5 py-2.5">Eigentümer</th>
            </tr>
          </thead>
        )}
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              className={`cursor-pointer border-b border-border last:border-0 hover:bg-canvas ${nested ? 'bg-canvas/40' : ''}`}
            >
              <td className={`py-2.5 font-mono text-xs text-ink ${nested ? 'pl-12 pr-5' : 'px-5'}`}>
                {item.inventoryNumber}
              </td>
              <td className="px-5 py-2.5 text-ink">{item.article.name}</td>
              <td className="px-5 py-2.5">
                <InventoryStatusBadge status={item.status} />
              </td>
              <td className="px-5 py-2.5 text-muted">
                {item.location.name} / {item.room.name}
              </td>
              <td className="px-5 py-2.5 text-muted">{item.ownerOrganization.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
