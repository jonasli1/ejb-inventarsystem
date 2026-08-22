import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useLocations, useRooms } from '@/lib/reference-data';
import type { Location } from '@/lib/api-types';
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

export function LocationsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.LOCATIONS_MANAGE);
  const { data: locations, isLoading } = useLocations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationModal, setLocationModal] = useState<{ open: boolean; editing: Location | null }>({
    open: false,
    editing: null,
  });
  const [roomModal, setRoomModal] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const selected = locations?.find((l) => l.id === selectedId) ?? locations?.[0] ?? null;

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/locations/${id}`),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      if (selectedId === id) setSelectedId(null);
      toast.push('Standort wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Lager"
        description="Standorte und Räume verwalten."
        actions={
          canManage && (
            <Button onClick={() => setLocationModal({ open: true, editing: null })}>
              <Plus size={16} />
              Neuer Standort
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !locations || locations.length === 0 ? (
        <EmptyState title="Keine Standorte vorhanden" description="Lege einen Standort an, um Räume zu verwalten." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Standorte</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border">
              {locations.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => setSelectedId(l.id)}
                    className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-canvas ${
                      selected?.id === l.id ? 'bg-brand-50 text-brand-700' : 'text-ink'
                    }`}
                  >
                    <span>
                      <span className="font-medium">{l.name}</span>
                      {l.address && <span className="block text-xs text-muted">{l.address}</span>}
                    </span>
                    {canManage && (
                      <span className="flex shrink-0 items-center gap-2">
                        <Pencil
                          size={14}
                          className="text-muted hover:text-ink"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocationModal({ open: true, editing: l });
                          }}
                        />
                        <Trash2
                          size={14}
                          className="text-muted hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Standort "${l.name}" wirklich löschen?`)) {
                              deleteLocationMutation.mutate(l.id);
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
              <CardTitle>Räume {selected ? `– ${selected.name}` : ''}</CardTitle>
              {canManage && selected && (
                <Button size="sm" onClick={() => setRoomModal(true)}>
                  <Plus size={14} />
                  Raum
                </Button>
              )}
            </CardHeader>
            <CardBody>
              {selected ? <RoomsList locationId={selected.id} canManage={canManage} /> : null}
            </CardBody>
          </Card>
        </div>
      )}

      <LocationFormModal
        open={locationModal.open}
        onClose={() => setLocationModal({ open: false, editing: null })}
        location={locationModal.editing}
      />
      {selected && (
        <RoomFormModal open={roomModal} onClose={() => setRoomModal(false)} locationId={selected.id} />
      )}
    </div>
  );
}

function RoomsList({ locationId, canManage }: { locationId: string; canManage: boolean }) {
  const { data: rooms, isLoading } = useRooms(locationId);
  const queryClient = useQueryClient();
  const toast = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/rooms/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.push('Raum wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (isLoading) return <Spinner />;
  if (!rooms || rooms.length === 0) return <p className="text-sm text-muted">Keine Räume vorhanden.</p>;

  return (
    <ul className="flex flex-col gap-1">
      {rooms.map((r) => (
        <li key={r.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-canvas">
          {r.name}
          {canManage && (
            <button onClick={() => deleteMutation.mutate(r.id)} className="text-muted hover:text-red-600">
              <Trash2 size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function LocationFormModal({
  open,
  onClose,
  location,
}: {
  open: boolean;
  onClose: () => void;
  location: Location | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(location?.name ?? '');
  const [address, setAddress] = useState(location?.address ?? '');

  useEffect(() => {
    if (open) {
      setName(location?.name ?? '');
      setAddress(location?.address ?? '');
    }
  }, [open, location]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (location) {
        return api.put(`/locations/${location.id}`, { name, address: address || undefined });
      }
      return api.post('/locations', { name, address: address || undefined });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.push(location ? 'Standort wurde aktualisiert.' : 'Standort wurde angelegt.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title={location ? 'Standort bearbeiten' : 'Neuer Standort'} size="sm">
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
        <Field label="Adresse (optional)">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {location ? 'Speichern' : 'Anlegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RoomFormModal({
  open,
  onClose,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');

  const mutation = useMutation({
    mutationFn: async () => api.post('/rooms', { name, locationId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.push('Raum wurde angelegt.');
      setName('');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Neuer Raum" size="sm">
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
