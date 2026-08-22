import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { LoanTemplate } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/toast';

export function LoanTemplatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['loan-templates'],
    queryFn: async () => (await api.get<LoanTemplate[]>('/loans/templates')).data,
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/loans/templates/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loan-templates'] });
      toast.push('Vorlage wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Ausleihe-Vorlagen" size="md">
      {query.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState
          title="Keine Vorlagen vorhanden"
          description='Beim Erstellen einer Ausleihe kann über "Objekte zusätzlich als Vorlage speichern" eine neue Vorlage angelegt werden.'
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {query.data.map((t) => (
            <li key={t.id} className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex-1 text-left font-medium text-ink hover:text-brand-700"
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  {t.name}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {t.items.length} Artikel{t.items.length === 1 ? '' : ''}
                  </span>
                </button>
                <button
                  type="button"
                  title="Vorlage löschen"
                  className="shrink-0 p-1 text-muted hover:text-red-600"
                  onClick={() => {
                    if (window.confirm(`Vorlage "${t.name}" wirklich löschen?`)) {
                      deleteMutation.mutate(t.id);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {expandedId === t.id && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  {t.items.map((item) => (
                    <li key={item.id} className="flex justify-between text-xs text-muted">
                      <span>{item.article.name}</span>
                      <span>{item.quantity}×</span>
                    </li>
                  ))}
                </ul>
              )}
              {t.notes && <p className="mt-1 text-xs text-muted">{t.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
