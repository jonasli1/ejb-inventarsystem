import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Info, Lock, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Role } from '@/lib/api-types';
import { PERMISSION_GROUPS, PERMISSION_INFO } from '@/lib/permission-labels';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { RoleDetailModal } from './RoleDetailModal';

const PROTECTED_ROLE_NAME = 'Admin';

function PermissionsInfoCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Info size={16} className="text-muted" />
          Was bedeuten die Berechtigungen?
        </span>
        <ChevronDown size={16} className={clsx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <CardBody className="grid grid-cols-1 gap-6 border-t border-border pt-4 sm:grid-cols-2">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-2.5">
                {group.permissions.map((key) => (
                  <div key={key}>
                    <dt className="text-sm font-medium text-ink">{PERMISSION_INFO[key].label}</dt>
                    <dd className="text-xs text-muted">{PERMISSION_INFO[key].description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </CardBody>
      )}
    </Card>
  );
}

export function RolesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get<Role[]>('/roles')).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.push('Rolle wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Rollen"
        description="Rollen bündeln Berechtigungen und werden Benutzern zugewiesen."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Neue Rolle
          </Button>
        }
      />

      <PermissionsInfoCard />

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <EmptyState title="Keine Rollen vorhanden" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.map((role) => (
              <li key={role.id}>
                <button
                  onClick={() => setSelectedId(role.id)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-canvas"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{role.name}</p>
                    {role.description && <p className="text-xs text-muted">{role.description}</p>}
                  </div>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted">
                      {role.rolePermissions?.length ?? 0} Berechtigungen
                    </span>
                    {role.name === PROTECTED_ROLE_NAME ? (
                      <span title="Diese Rolle ist geschützt und kann nicht gelöscht werden">
                        <Lock
                          size={14}
                          className="shrink-0 text-muted"
                          aria-label="Diese Rolle ist geschützt und kann nicht gelöscht werden"
                        />
                      </span>
                    ) : (
                      <Trash2
                        size={14}
                        className="shrink-0 text-muted hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Rolle "${role.name}" wirklich löschen?`)) {
                            deleteMutation.mutate(role.id);
                          }
                        }}
                      />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RoleCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {selectedId && <RoleDetailModal roleId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function RoleCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: async () => api.post('/roles', { name, description: description || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.push('Rolle wurde angelegt.');
      setName('');
      setDescription('');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Neue Rolle" size="sm">
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
