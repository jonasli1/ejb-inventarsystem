import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useOrganizations } from '@/lib/reference-data';
import type { Group, GroupRoleMapping, Role } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';

export function GroupDetailModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const groupQuery = useQuery({
    queryKey: ['groups', groupId],
    queryFn: async () => (await api.get<Group>(`/groups/${groupId}`)).data,
  });
  const groupRolesQuery = useQuery({
    queryKey: ['groups', groupId, 'roles'],
    queryFn: async () => (await api.get<GroupRoleMapping[]>(`/groups/${groupId}/roles`)).data,
  });
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get<Role[]>('/roles')).data,
  });
  const { data: organizations } = useOrganizations();

  const [roleToAdd, setRoleToAdd] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups', groupId, 'roles'] });
  };

  const updateOrganization = useMutation({
    mutationFn: async (organizationId: string) =>
      api.put(`/groups/${groupId}`, { organizationId: organizationId || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.push('Organisation der Gruppe wurde aktualisiert.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const addRole = useMutation({
    mutationFn: async (roleId: string) => api.post(`/groups/${groupId}/roles`, { roleId }),
    onSuccess: () => {
      invalidate();
      setRoleToAdd('');
      toast.push('Mitglieder dieser Gruppe erhalten die Rolle jetzt automatisch.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });
  const removeRole = useMutation({
    mutationFn: async (roleId: string) => api.delete(`/groups/${groupId}/roles/${roleId}`),
    onSuccess: invalidate,
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (groupQuery.isLoading || !groupQuery.data) {
    return (
      <Modal open onClose={onClose} title="Gruppe">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Modal>
    );
  }

  const assignedRoleIds = new Set(groupRolesQuery.data?.map((gr) => gr.roleId));
  const availableRoles = rolesQuery.data?.filter((r) => !assignedRoleIds.has(r.id)) ?? [];

  return (
    <Modal open onClose={onClose} title={groupQuery.data.name} size="md">
      <div className="flex flex-col gap-6">
        <div>
          <Field label="Organisation">
            <Select
              value={groupQuery.data.organizationId ?? ''}
              onChange={(e) => updateOrganization.mutate(e.target.value)}
            >
              <option value="">Keine</option>
              {organizations?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-1.5 text-xs text-muted">
            Mitglieder dieser Gruppe gelten für die organisationsbezogene Ausleihe-Verwaltung
            (Berechtigung <code className="rounded bg-black/5 px-1 py-0.5">loans.manage</code>) als
            Angehörige dieser Organisation.
          </p>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink">Automatische Rollenzuweisung</h3>
          <p className="mb-3 text-xs text-muted">
            Mitglieder dieser Gruppe erhalten die folgenden Rollen automatisch — und verlieren sie wieder,
            sobald sie die Gruppe verlassen (sofern die Rolle nicht zusätzlich manuell zugewiesen wurde).
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {groupRolesQuery.data?.map((gr) => (
              <Badge key={gr.roleId} tone="purple" className="gap-1 pr-1">
                {gr.role.name}
                <button
                  onClick={() => removeRole.mutate(gr.roleId)}
                  className="rounded-full hover:bg-black/10"
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
            {groupRolesQuery.data?.length === 0 && (
              <span className="text-sm text-muted">Keine automatische Rollenzuweisung</span>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value)} className="max-w-xs">
              <option value="">Rolle hinzufügen …</option>
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!roleToAdd}
              onClick={() => addRole.mutate(roleToAdd)}
            >
              Hinzufügen
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
