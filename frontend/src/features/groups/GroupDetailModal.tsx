import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useOrganizations, useOrganizationUnits } from '@/lib/reference-data';
import type { Group, GroupOrganizationScope, GroupRoleMapping, Role } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
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
  const scopesQuery = useQuery({
    queryKey: ['groups', groupId, 'organization-scopes'],
    queryFn: async () =>
      (await api.get<GroupOrganizationScope[]>(`/groups/${groupId}/organization-scopes`)).data,
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
  const [scopeOrgId, setScopeOrgId] = useState('');
  const [scopeUnitId, setScopeUnitId] = useState('');
  const { data: unitsForScopeOrg } = useOrganizationUnits(scopeOrgId || undefined);

  const invalidateRoles = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups', groupId, 'roles'] });
  };
  const invalidateScopes = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups', groupId, 'organization-scopes'] });
  };

  const addScope = useMutation({
    mutationFn: async () =>
      api.post(`/groups/${groupId}/organization-scopes`, {
        organizationId: scopeOrgId,
        organizationUnitId: scopeUnitId || undefined,
      }),
    onSuccess: () => {
      invalidateScopes();
      setScopeOrgId('');
      setScopeUnitId('');
      toast.push('Zuordnung wurde hinzugefügt.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });
  const removeScope = useMutation({
    mutationFn: async (scopeId: string) =>
      api.delete(`/groups/${groupId}/organization-scopes/${scopeId}`),
    onSuccess: invalidateScopes,
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const addRole = useMutation({
    mutationFn: async (roleId: string) => api.post(`/groups/${groupId}/roles`, { roleId }),
    onSuccess: () => {
      invalidateRoles();
      setRoleToAdd('');
      toast.push('Mitglieder dieser Gruppe erhalten die Rolle jetzt automatisch.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });
  const removeRole = useMutation({
    mutationFn: async (roleId: string) => api.delete(`/groups/${groupId}/roles/${roleId}`),
    onSuccess: invalidateRoles,
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
          <h3 className="mb-1 text-sm font-semibold text-ink">Organisationen &amp; Untereinheiten</h3>
          <p className="mb-3 text-xs text-muted">
            Mitglieder dieser Gruppe gelten für die organisations-/untereinheiten-bezogene
            Ausleihe-Verwaltung (Berechtigungen{' '}
            <code className="rounded bg-black/5 px-1 py-0.5">loans.manage</code> und{' '}
            <code className="rounded bg-black/5 px-1 py-0.5">loans.spend</code>) als zugehörig zu den
            hier zugeordneten Organisationen bzw. Untereinheiten. Eine Gruppe kann mehrere
            Zuordnungen haben.
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {scopesQuery.data?.map((scope) => (
              <Badge key={scope.id} tone="blue" className="gap-1 pr-1">
                {scope.organization.name}
                {scope.organizationUnit ? ` / ${scope.organizationUnit.name}` : ' (ganze Organisation)'}
                <button
                  onClick={() => removeScope.mutate(scope.id)}
                  className="rounded-full hover:bg-black/10"
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
            {scopesQuery.data?.length === 0 && (
              <span className="text-sm text-muted">Keine Zuordnung</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={scopeOrgId}
              onChange={(e) => {
                setScopeOrgId(e.target.value);
                setScopeUnitId('');
              }}
              className="max-w-xs"
            >
              <option value="">Organisation wählen …</option>
              {organizations?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            <Select
              value={scopeUnitId}
              onChange={(e) => setScopeUnitId(e.target.value)}
              className="max-w-xs"
              disabled={!scopeOrgId}
            >
              <option value="">Ganze Organisation</option>
              {unitsForScopeOrg?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!scopeOrgId}
              loading={addScope.isPending}
              onClick={() => addScope.mutate()}
            >
              Hinzufügen
            </Button>
          </div>
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
