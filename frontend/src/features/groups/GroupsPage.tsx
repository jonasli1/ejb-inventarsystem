import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Group, PaginatedResult } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { GroupDetailModal } from './GroupDetailModal';

export function GroupsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: ['groups', 'list', page],
    queryFn: async () =>
      (await api.get<PaginatedResult<Group>>('/groups', { params: { page, pageSize: 20 } })).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/groups/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.push('Gruppe wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Gruppen"
        description="Gruppen aus ChurchTools (automatisch synchronisiert) und manuell angelegte Gruppen."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Neue Gruppe
          </Button>
        }
      />

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.data.length === 0 ? (
          <EmptyState title="Keine Gruppen vorhanden" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">Herkunft</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((group) => (
                  <tr
                    key={group.id}
                    onClick={() => setSelectedId(group.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-canvas"
                  >
                    <td className="px-5 py-2.5 font-medium text-ink">{group.name}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={group.externalRef ? 'blue' : 'neutral'}>
                        {group.externalRef ? 'ChurchTools' : 'Manuell'}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(group.id);
                        }}
                        className="text-muted hover:text-red-600"
                        aria-label={`${group.name} löschen`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
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

      <GroupCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {selectedId && <GroupDetailModal groupId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function GroupCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: async () => api.post('/groups', { name, description: description || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.push('Gruppe wurde angelegt.');
      setName('');
      setDescription('');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Neue Gruppe" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Beschreibung (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Anlegen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
