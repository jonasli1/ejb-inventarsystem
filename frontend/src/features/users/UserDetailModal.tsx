import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, X } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Role, User, UserGroupMembership, UserRoleAssignment } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';

interface UserDetail extends User {
  userRoles: UserRoleAssignment[];
}

export function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canResetPassword = hasPermission(PERMISSIONS.USERS_RESET_PASSWORD);
  const canChangeEmail = hasPermission(PERMISSIONS.USERS_CHANGE_EMAIL);

  const userQuery = useQuery({
    queryKey: ['users', userId],
    queryFn: async () => (await api.get<UserDetail>(`/users/${userId}`)).data,
  });
  const groupsQuery = useQuery({
    queryKey: ['users', userId, 'groups'],
    queryFn: async () => (await api.get<UserGroupMembership[]>(`/users/${userId}/groups`)).data,
  });
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get<Role[]>('/roles')).data,
  });
  const groupsListQuery = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: async () =>
      (await api.get<{ data: { id: string; name: string }[] }>('/groups', { params: { pageSize: 100 } })).data.data,
  });

  const [displayName, setDisplayName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [roleToAdd, setRoleToAdd] = useState('');
  const [groupToAdd, setGroupToAdd] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (userQuery.data) {
      setDisplayName(userQuery.data.displayName);
      setIsActive(userQuery.data.isActive);
      setNewEmail(userQuery.data.email);
    }
  }, [userQuery.data]);

  const invalidateUser = () => {
    void queryClient.invalidateQueries({ queryKey: ['users', userId] });
    void queryClient.invalidateQueries({ queryKey: ['users', userId, 'groups'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const updateMutation = useMutation({
    mutationFn: async () => api.put(`/users/${userId}`, { displayName, isActive }),
    onSuccess: () => {
      invalidateUser();
      toast.push('Benutzer wurde aktualisiert.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const addRole = useMutation({
    mutationFn: async (roleId: string) => api.post(`/users/${userId}/roles`, { roleId }),
    onSuccess: () => {
      invalidateUser();
      setRoleToAdd('');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });
  const removeRole = useMutation({
    mutationFn: async (roleId: string) => api.delete(`/users/${userId}/roles/${roleId}`),
    onSuccess: invalidateUser,
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const addGroup = useMutation({
    mutationFn: async (groupId: string) => api.post(`/users/${userId}/groups`, { groupId }),
    onSuccess: () => {
      invalidateUser();
      setGroupToAdd('');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });
  const removeGroup = useMutation({
    mutationFn: async (groupId: string) => api.delete(`/users/${userId}/groups/${groupId}`),
    onSuccess: invalidateUser,
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => api.post(`/users/${userId}/reset-password`, { newPassword }),
    onSuccess: () => {
      setNewPassword('');
      toast.push('Passwort wurde zurückgesetzt.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const changeEmailMutation = useMutation({
    mutationFn: async () => api.put(`/users/${userId}/email`, { email: newEmail }),
    onSuccess: () => {
      invalidateUser();
      toast.push('E-Mail-Adresse wurde geändert.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (userQuery.isLoading || !userQuery.data) {
    return (
      <Modal open onClose={onClose} title="Benutzer">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Modal>
    );
  }

  const assignedRoleIds = new Set(userQuery.data.userRoles.map((ur) => ur.role.id));
  const availableRoles = rolesQuery.data?.filter((r) => !assignedRoleIds.has(r.id)) ?? [];
  const assignedGroupIds = new Set(groupsQuery.data?.map((g) => g.groupId));
  const availableGroups = groupsListQuery.data?.filter((g) => !assignedGroupIds.has(g.id)) ?? [];

  return (
    <Modal open onClose={onClose} title={userQuery.data.displayName} size="lg">
      <div className="flex flex-col gap-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <Field label="Name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="E-Mail">
            <Input value={userQuery.data.email} disabled />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Aktiv
          </label>
          <div className="flex items-end justify-end">
            <Button type="submit" size="sm" loading={updateMutation.isPending}>
              Speichern
            </Button>
          </div>
        </form>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Rollen</h3>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {userQuery.data.userRoles.map((ur) => (
              <Badge key={ur.role.id} tone="purple" className="gap-1 pr-1">
                {ur.role.name}
                {ur.source === 'group' && <span className="text-[10px] opacity-70">(via Gruppe)</span>}
                {ur.source === 'manual' && (
                  <button onClick={() => removeRole.mutate(ur.role.id)} className="rounded-full hover:bg-black/10">
                    <X size={12} />
                  </button>
                )}
              </Badge>
            ))}
            {userQuery.data.userRoles.length === 0 && <span className="text-sm text-muted">Keine Rollen</span>}
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
          <p className="mt-1.5 text-xs text-muted">
            Über eine Gruppe automatisch zugewiesene Rollen können nur durch Verlassen der Gruppe entfernt werden.
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Gruppen</h3>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {groupsQuery.data?.map((g) => (
              <Badge key={g.id} tone={g.source === 'manual' ? 'blue' : 'neutral'} className="gap-1 pr-1">
                {g.group.name}
                <span className="text-[10px] opacity-70">({g.source === 'manual' ? 'manuell' : 'ChurchTools'})</span>
                {g.source === 'manual' && (
                  <button onClick={() => removeGroup.mutate(g.groupId)} className="rounded-full hover:bg-black/10">
                    <X size={12} />
                  </button>
                )}
              </Badge>
            ))}
            {groupsQuery.data?.length === 0 && <span className="text-sm text-muted">Keine Gruppen</span>}
          </div>
          <div className="flex gap-2">
            <Select value={groupToAdd} onChange={(e) => setGroupToAdd(e.target.value)} className="max-w-xs">
              <option value="">Gruppe hinzufügen …</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!groupToAdd}
              onClick={() => addGroup.mutate(groupToAdd)}
            >
              Hinzufügen
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            ChurchTools-Mitgliedschaften werden beim Login synchronisiert und können hier nicht entfernt werden.
          </p>
        </div>

        {(canChangeEmail || canResetPassword) && (
          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
            {canChangeEmail && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Mail size={14} />
                  E-Mail ändern
                </h3>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!newEmail || newEmail === userQuery.data.email}
                    loading={changeEmailMutation.isPending}
                    onClick={() => changeEmailMutation.mutate()}
                  >
                    Ändern
                  </Button>
                </div>
              </div>
            )}

            {canResetPassword && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <KeyRound size={14} />
                  Passwort zurücksetzen
                </h3>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Neues Passwort (mind. 8 Zeichen)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={newPassword.length < 8}
                    loading={resetPasswordMutation.isPending}
                    onClick={() => resetPasswordMutation.mutate()}
                  >
                    Setzen
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Der Benutzer kann das Passwort danach jederzeit selbst wieder ändern.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
