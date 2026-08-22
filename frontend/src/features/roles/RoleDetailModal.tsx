import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Permission, Role } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';

export function RoleDetailModal({ roleId, onClose }: { roleId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const roleQuery = useQuery({
    queryKey: ['roles', roleId],
    queryFn: async () => (await api.get<Role>(`/roles/${roleId}`)).data,
  });
  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => (await api.get<Permission[]>('/permissions')).data,
  });

  const [description, setDescription] = useState('');
  const [permissionToAdd, setPermissionToAdd] = useState('');

  useEffect(() => {
    if (roleQuery.data) setDescription(roleQuery.data.description ?? '');
  }, [roleQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['roles', roleId] });
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
  };

  const updateMutation = useMutation({
    mutationFn: async () => api.put(`/roles/${roleId}`, { description }),
    onSuccess: () => {
      invalidate();
      toast.push('Rolle wurde aktualisiert.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const addPermission = useMutation({
    mutationFn: async (permissionId: string) => api.post(`/roles/${roleId}/permissions`, { permissionId }),
    onSuccess: () => {
      invalidate();
      setPermissionToAdd('');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });
  const removePermission = useMutation({
    mutationFn: async (permissionId: string) => api.delete(`/roles/${roleId}/permissions/${permissionId}`),
    onSuccess: invalidate,
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (roleQuery.isLoading || !roleQuery.data) {
    return (
      <Modal open onClose={onClose} title="Rolle">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Modal>
    );
  }

  const assignedIds = new Set(roleQuery.data.rolePermissions?.map((rp) => rp.permission.id));
  const available = permissionsQuery.data?.filter((p) => !assignedIds.has(p.id)) ?? [];

  return (
    <Modal open onClose={onClose} title={roleQuery.data.name} size="md">
      <div className="flex flex-col gap-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Field label="Beschreibung">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" size="sm" loading={updateMutation.isPending}>
            Speichern
          </Button>
        </form>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Berechtigungen</h3>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {roleQuery.data.rolePermissions?.map((rp) => (
              <Badge key={rp.permission.id} tone="purple" className="gap-1 pr-1">
                {rp.permission.key}
                <button
                  onClick={() => removePermission.mutate(rp.permission.id)}
                  className="rounded-full hover:bg-black/10"
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
            {roleQuery.data.rolePermissions?.length === 0 && (
              <span className="text-sm text-muted">Keine Berechtigungen</span>
            )}
          </div>
          <div className="flex gap-2">
            <Select
              value={permissionToAdd}
              onChange={(e) => setPermissionToAdd(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Berechtigung hinzufügen …</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!permissionToAdd}
              onClick={() => addPermission.mutate(permissionToAdd)}
            >
              Hinzufügen
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
