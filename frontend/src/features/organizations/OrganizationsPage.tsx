import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useOrganizations, useOrganizationUnits } from '@/lib/reference-data';
import type { Organization } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';

export function OrganizationsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.ORGANIZATIONS_MANAGE);
  const { data: organizations, isLoading } = useOrganizations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orgModal, setOrgModal] = useState<{ open: boolean; editing: Organization | null }>({
    open: false,
    editing: null,
  });
  const [unitModal, setUnitModal] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const selected = organizations?.find((o) => o.id === selectedId) ?? organizations?.[0] ?? null;

  const deleteOrgMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/organizations/${id}`),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
      if (selectedId === id) setSelectedId(null);
      toast.push('Organisation wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Organisationen"
        description="Organisationen und Untereinheiten für den zweistufigen Eigentümer verwalten."
        actions={
          canManage && (
            <Button onClick={() => setOrgModal({ open: true, editing: null })}>
              <Plus size={16} />
              Neue Organisation
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !organizations || organizations.length === 0 ? (
        <EmptyState title="Keine Organisationen vorhanden" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Organisationen</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border">
              {organizations.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => setSelectedId(o.id)}
                    className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-canvas ${
                      selected?.id === o.id ? 'bg-brand-50 text-brand-700' : 'text-ink'
                    }`}
                  >
                    <span className="font-medium">{o.name}</span>
                    {canManage && (
                      <span className="flex shrink-0 items-center gap-2">
                        <Pencil
                          size={14}
                          className="text-muted hover:text-ink"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOrgModal({ open: true, editing: o });
                          }}
                        />
                        <Trash2
                          size={14}
                          className="text-muted hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Organisation "${o.name}" wirklich löschen?`)) {
                              deleteOrgMutation.mutate(o.id);
                            }
                          }}
                        />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Untereinheiten {selected ? `– ${selected.name}` : ''}</CardTitle>
              {canManage && selected && (
                <Button size="sm" onClick={() => setUnitModal(true)}>
                  <Plus size={14} />
                  Untereinheit
                </Button>
              )}
            </CardHeader>
            <CardBody>
              {selected ? <UnitsList organizationId={selected.id} canManage={canManage} /> : null}
            </CardBody>
          </Card>
        </div>
      )}

      <OrganizationFormModal
        open={orgModal.open}
        onClose={() => setOrgModal({ open: false, editing: null })}
        organization={orgModal.editing}
      />
      {selected && (
        <UnitFormModal open={unitModal} onClose={() => setUnitModal(false)} organizationId={selected.id} />
      )}
    </div>
  );
}

function UnitsList({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const { data: units, isLoading } = useOrganizationUnits(organizationId);
  const queryClient = useQueryClient();
  const toast = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/organizations/${organizationId}/units/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organization-units'] });
      toast.push('Untereinheit wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (isLoading) return <Spinner />;
  if (!units || units.length === 0) return <p className="text-sm text-muted">Keine Untereinheiten vorhanden.</p>;

  return (
    <ul className="flex flex-col gap-1">
      {units.map((u) => (
        <li key={u.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-canvas">
          {u.name}
          {canManage && (
            <button onClick={() => deleteMutation.mutate(u.id)} className="text-muted hover:text-red-600">
              <Trash2 size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function OrganizationFormModal({
  open,
  onClose,
  organization,
}: {
  open: boolean;
  onClose: () => void;
  organization: Organization | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(organization?.name ?? '');
  }, [open, organization]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (organization) return api.put(`/organizations/${organization.id}`, { name });
      return api.post('/organizations', { name });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.push(organization ? 'Organisation wurde aktualisiert.' : 'Organisation wurde angelegt.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={organization ? 'Organisation bearbeiten' : 'Neue Organisation'}
      size="sm"
    >
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {organization ? 'Speichern' : 'Anlegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function UnitFormModal({
  open,
  onClose,
  organizationId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');

  const mutation = useMutation({
    mutationFn: async () => api.post(`/organizations/${organizationId}/units`, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organization-units'] });
      toast.push('Untereinheit wurde angelegt.');
      setName('');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Neue Untereinheit" size="sm">
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
