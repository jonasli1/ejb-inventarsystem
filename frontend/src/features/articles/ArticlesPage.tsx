import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tags, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Article, ArticleType, PaginatedResult } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { ArticleTypeBadge } from '@/components/ui/Badge';
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
  const canManage = hasPermission(PERMISSIONS.ARTICLES_MANAGE);
  const canExport = hasPermission(PERMISSIONS.REPORTS_VIEW);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [type, setType] = useState<ArticleType | ''>('');
  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const query = useQuery({
    queryKey: ['articles', 'list', page, type],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Article>>('/articles', {
          params: { page, pageSize: 20, ...(type ? { type } : {}) },
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
        <div className="flex items-end justify-between gap-3 p-4">
          <div className="w-56">
            <label className="mb-1.5 block text-xs font-medium text-muted">Typ</label>
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value as ArticleType | '');
                setPage(1);
              }}
            >
              <option value="">Alle</option>
              <option value="UNIQUE">Einzelobjekt</option>
              <option value="BULK">Mehrfachobjekt</option>
              <option value="CONSUMABLE">Verbrauchsobjekt</option>
            </Select>
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
