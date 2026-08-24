import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Tags, Trash2, X } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Article, ArticleType, PaginatedResult } from '@/lib/api-types';
import { useCategories } from '@/lib/reference-data';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ArticleTypeBadge } from '@/components/ui/Badge';
import { ArticleImageThumbnail } from '@/components/ui/ArticleImageThumbnail';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { downloadExport } from '@/lib/export';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { ArticleFormModal } from './ArticleFormModal';
import { CategoriesModal } from './CategoriesModal';
import { ArticleFilterMenu, ARTICLE_FILTER_TYPE_LABEL, type ArticleFilterType } from './ArticleFilterMenu';

const ARTICLE_TYPE_LABEL: Record<ArticleType, string> = {
  UNIQUE: 'Einzelobjekt',
  BULK: 'Mehrfachobjekt',
  CONSUMABLE: 'Verbrauchsobjekt',
};

export function ArticlesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.ARTICLES_MANAGE);
  const canExport = hasPermission(PERMISSIONS.REPORTS_VIEW);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: categories } = useCategories();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ArticleType | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebouncedValue(search, 250);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filterOptions: Record<ArticleFilterType, { value: string; label: string }[]> = {
    type: Object.entries(ARTICLE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    categoryId: (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
  };

  const activeFilters: { type: ArticleFilterType; label: string }[] = [
    ...(type ? [{ type: 'type' as const, label: ARTICLE_TYPE_LABEL[type] }] : []),
    ...(categoryId
      ? [{ type: 'categoryId' as const, label: categories?.find((c) => c.id === categoryId)?.name ?? '' }]
      : []),
  ];

  const addFilter = (filterType: ArticleFilterType, value: string) => {
    if (filterType === 'type') setType(value as ArticleType);
    else setCategoryId(value);
    setPage(1);
  };

  const removeFilter = (filterType: ArticleFilterType) => {
    if (filterType === 'type') setType('');
    else setCategoryId('');
    setPage(1);
  };

  const resetFilters = () => {
    setType('');
    setCategoryId('');
    setPage(1);
  };

  const query = useQuery({
    queryKey: ['articles', 'list', page, debouncedSearch, type, categoryId],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Article>>('/articles', {
          params: {
            page,
            pageSize: 20,
            ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
            ...(type ? { type } : {}),
            ...(categoryId ? { categoryId } : {}),
          },
        })
      ).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/articles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.push('Artikel wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Artikel"
        description="Katalog der Artikeltypen inklusive Bestandsübersicht."
        actions={
          canManage && (
            <>
              <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
                <Tags size={16} />
                Kategorien
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={16} />
                Neuer Artikel
              </Button>
            </>
          )
        }
      />

      <Card className="mb-4">
        <div className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="relative w-full min-w-[200px] max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                className="pl-9"
                placeholder="Suche nach Name, Hersteller, Beschreibung, Kategorie …"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {canExport && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {selected.size > 0 ? `${selected.size} ausgewählt` : 'Alle Artikel'}
                </span>
                <ExportButtons
                  onExport={(fmt) =>
                    downloadExport(
                      '/export/articles',
                      { format: fmt, articleIds: selected.size > 0 ? [...selected] : undefined },
                      `Artikel.${fmt}`,
                    )
                  }
                />
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ArticleFilterMenu options={filterOptions} onAdd={addFilter} />
            {activeFilters.map((f) => (
              <span
                key={f.type}
                className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-700"
              >
                {ARTICLE_FILTER_TYPE_LABEL[f.type]}: {f.label}
                <button
                  type="button"
                  onClick={() => removeFilter(f.type)}
                  className="rounded-full p-0.5 hover:bg-brand-100"
                  title={`Filter "${ARTICLE_FILTER_TYPE_LABEL[f.type]}" entfernen`}
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
          </div>
        </div>
      </Card>

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.data.length === 0 ? (
          <EmptyState title="Keine Artikel gefunden" description="Lege einen neuen Artikel an, um zu starten." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  {canExport && <th className="w-8 px-5 py-2.5" />}
                  <th className="w-14 pl-5 py-2.5" />
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">Typ</th>
                  <th className="px-5 py-2.5">Kategorie</th>
                  <th className="px-5 py-2.5">Bestand</th>
                  {canManage && <th className="px-5 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((article) => (
                  <tr
                    key={article.id}
                    onClick={() => {
                      if (!canManage) return;
                      setEditing(article);
                      setFormOpen(true);
                    }}
                    className={`border-b border-border last:border-0 ${canManage ? 'cursor-pointer hover:bg-canvas' : ''}`}
                  >
                    {canExport && (
                      <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(article.id)}
                          onChange={() => toggleSelected(article.id)}
                        />
                      </td>
                    )}
                    <td className="py-2.5 pl-5">
                      <ArticleImageThumbnail articleId={article.id} size="h-8 w-8" />
                    </td>
                    <td className="px-5 py-2.5 font-medium text-ink">{article.name}</td>
                    <td className="px-5 py-2.5">
                      <ArticleTypeBadge type={article.type} />
                    </td>
                    <td className="px-5 py-2.5 text-muted">{article.category?.name ?? '–'}</td>
                    <td className="px-5 py-2.5 text-muted">
                      {article.stock.total} gesamt · {article.stock.available} verfügbar ·{' '}
                      {article.stock.borrowed} ausgeliehen
                    </td>
                    {canManage && (
                      <td className="px-5 py-2.5 text-right">
                        {article.stock.total === 0 ? (
                          <Trash2
                            size={14}
                            className="ml-auto shrink-0 text-muted hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Artikel "${article.name}" wirklich löschen?`)) {
                                deleteMutation.mutate(article.id);
                              }
                            }}
                          />
                        ) : (
                          <span title="Artikel mit Beständen im Lager können nicht gelöscht werden">
                            <Trash2 size={14} className="ml-auto shrink-0 text-border" />
                          </span>
                        )}
                      </td>
                    )}
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

      <ArticleFormModal open={formOpen} onClose={() => setFormOpen(false)} article={editing} />
      <CategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  );
}
