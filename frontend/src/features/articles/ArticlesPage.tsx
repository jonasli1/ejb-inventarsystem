import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Tags, Trash2, X } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Article, PaginatedResult } from '@/lib/api-types';
import { useCategories } from '@/lib/reference-data';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
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

export function ArticlesPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.ARTICLES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.ARTICLES_UPDATE);
  const canDelete = hasPermission(PERMISSIONS.ARTICLES_DELETE);
  const canExport = hasPermission(PERMISSIONS.REPORTS_VIEW);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: categories } = useCategories();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);

  const debouncedSearch = useDebouncedValue(search, 250);

  const query = useQuery({
    queryKey: ['articles', 'list', page, debouncedSearch, categoryId],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Article>>('/articles', {
          params: {
            page,
            pageSize: 20,
            ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
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
        description="Katalog der Artikel inklusive Bestandsübersicht."
        actions={
          <>
            {canUpdate && (
              <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
                <Tags size={16} />
                Kategorien
              </Button>
            )}
            {canCreate && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={16} />
                Neuer Artikel
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative w-full min-w-[220px] max-w-sm">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-9"
                  placeholder="Suche nach Name, Kosename, Hersteller, Kategorie …"
                  role="searchbox"
                  name="article-search"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="w-48">
                <Select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Alle Kategorien</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              {categoryId && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryId('');
                    setPage(1);
                  }}
                  className="flex items-center gap-1 p-2 -m-2 text-xs font-medium text-muted hover:text-ink"
                >
                  <X size={13} />
                  Kategorie zurücksetzen
                </button>
              )}
            </div>
            {canExport && (
              <ExportButtons
                onExport={(fmt) => downloadExport('/export/articles', { format: fmt }, `Artikel.${fmt}`)}
              />
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
          <div>
            <div className="hidden items-center gap-3 border-b border-border px-5 py-2.5 text-left text-xs font-medium text-muted sm:flex">
              <span className="w-8" />
              <span className="flex-1">Name</span>
              <span className="w-40">Kategorie</span>
              <span className="w-64">Bestand</span>
              {(canUpdate || canDelete) && <span className="w-8" />}
            </div>
            <div className="divide-y divide-border">
              {query.data.data.map((article) => (
                <div
                  key={article.id}
                  onClick={() => {
                    if (!canUpdate) return;
                    setEditing(article);
                    setFormOpen(true);
                  }}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 sm:flex-nowrap ${canUpdate ? 'cursor-pointer hover:bg-canvas' : ''}`}
                >
                  <ArticleImageThumbnail articleId={article.id} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {article.name}
                      {article.aliases.length > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-muted">
                          ({article.aliases.join(', ')})
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted sm:hidden">
                      {article.category?.name ?? 'Ohne Kategorie'} · {article.stock.total} gesamt ·{' '}
                      {article.stock.available} verfügbar
                    </p>
                  </div>
                  <span className="hidden w-40 truncate text-muted sm:inline">{article.category?.name ?? '–'}</span>
                  <span className="hidden w-64 text-muted sm:inline">
                    {article.stock.total} gesamt · {article.stock.available} verfügbar ·{' '}
                    {article.stock.borrowed} ausgeliehen
                  </span>
                  {canDelete && (
                    <span className="w-8 shrink-0 text-right">
                      {article.stock.total === 0 ? (
                        <button
                          type="button"
                          title="Artikel löschen"
                          aria-label={`Artikel "${article.name}" löschen`}
                          className="-m-2 p-2 text-muted hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Artikel "${article.name}" wirklich löschen?`)) {
                              deleteMutation.mutate(article.id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <span title="Artikel mit Beständen im Lager können nicht gelöscht werden">
                          <Trash2 size={14} className="-m-2 inline-block p-2 text-border" />
                        </span>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
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
