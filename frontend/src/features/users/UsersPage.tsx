import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { PaginatedResult, User } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/auth/useAuth';
import { UserCreateModal } from './UserCreateModal';
import { UserDetailModal } from './UserDetailModal';

export function UsersPage() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['users', 'list', page],
    queryFn: async () =>
      (await api.get<PaginatedResult<User>>('/users', { params: { page, pageSize: 20 } })).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.push('Benutzer wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Benutzer"
        description="Benutzerkonten, Rollen und Gruppenzugehörigkeiten verwalten."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Neuer Benutzer
          </Button>
        }
      />

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.data.length === 0 ? (
          <EmptyState title="Keine Benutzer gefunden" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">E-Mail</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedId(user.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-canvas"
                  >
                    <td className="px-5 py-2.5 font-medium text-ink">{user.displayName}</td>
                    <td className="px-5 py-2.5 text-muted">{user.email}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={user.isActive ? 'green' : 'neutral'}>
                        {user.isActive ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {user.id !== me?.id && (
                        <Trash2
                          size={14}
                          className="ml-auto shrink-0 text-muted hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Benutzer "${user.displayName}" wirklich löschen?`)) {
                              deleteMutation.mutate(user.id);
                            }
                          }}
                        />
                      )}
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

      <UserCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {selectedId && <UserDetailModal userId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
