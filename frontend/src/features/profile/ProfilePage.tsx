import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Fingerprint, KeyRound, Mail, Moon, ShieldCheck, Sun, UsersRound } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { NotificationPreferenceEntry, ThemePreference } from '@/lib/api-types';
import { applyTheme } from '@/lib/theme';
import { registerPasskey, isWebAuthnSupported } from '@/features/auth/passkey';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'System' },
];

export function ProfilePage() {
  const { me, refreshMe, logout } = useAuth();
  const toast = useToast();
  const [deviceLabel, setDeviceLabel] = useState('');
  const [loading, setLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const onRegisterPasskey = async () => {
    setLoading(true);
    try {
      await registerPasskey(deviceLabel || undefined);
      await refreshMe();
      toast.push('Passkey wurde erfolgreich hinzugefügt.');
      setDeviceLabel('');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Passkey konnte nicht registriert werden.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const changePasswordMutation = useMutation({
    mutationFn: async () =>
      api.post('/auth/change-password', {
        currentPassword,
        newPassword,
        newPasswordConfirmation,
      }),
    onSuccess: async () => {
      toast.push('Passwort wurde geändert. Bitte melde dich erneut an.');
      await logout();
    },
    onError: (err) => setPasswordError(getApiErrorMessage(err)),
  });

  if (!me) return null;
  const hasLocalPassword = me.authMethods.includes('local');

  return (
    <div>
      <PageHeader title="Profil" description="Deine Kontoinformationen und Anmeldemethoden." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Konto</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-muted" />
              <span className="text-ink">{me.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-muted" />
              <span className="text-ink">{me.roles.map((r) => r.name).join(', ') || 'Keine Rollen'}</span>
            </div>
            <div className="flex items-center gap-2">
              <UsersRound size={15} className="text-muted" />
              <span className="text-ink">{me.groups.map((g) => g.name).join(', ') || 'Keine Gruppen'}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {me.permissions.map((p) => (
                <Badge key={p} tone="neutral">
                  {p}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anmeldemethoden</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5">
              {me.authMethods.map((m) => (
                <Badge key={m} tone="blue">
                  {m}
                </Badge>
              ))}
            </div>

            {isWebAuthnSupported() ? (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-medium text-ink">Passkey hinzufügen</p>
                <div className="flex gap-2">
                  <Field label="Gerätename (optional)">
                    <Input
                      placeholder="z. B. MacBook Pro"
                      value={deviceLabel}
                      onChange={(e) => setDeviceLabel(e.target.value)}
                    />
                  </Field>
                </div>
                <Button className="mt-3" loading={loading} onClick={() => void onRegisterPasskey()}>
                  <Fingerprint size={16} />
                  Passkey registrieren
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Dein Browser unterstützt keine Passkeys (WebAuthn).
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Passwort ändern</CardTitle>
          </CardHeader>
          <CardBody>
            {hasLocalPassword ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPasswordError(null);
                  if (newPassword !== newPasswordConfirmation) {
                    setPasswordError('Die neuen Passwörter stimmen nicht überein.');
                    return;
                  }
                  changePasswordMutation.mutate();
                }}
                className="flex flex-col gap-3"
              >
                <Field label="Aktuelles Passwort">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Neues Passwort">
                  <Input
                    type="password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Neues Passwort bestätigen">
                  <Input
                    type="password"
                    minLength={8}
                    value={newPasswordConfirmation}
                    onChange={(e) => setNewPasswordConfirmation(e.target.value)}
                    required
                  />
                </Field>
                {passwordError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{passwordError}</p>
                )}
                <Button type="submit" className="self-start" loading={changePasswordMutation.isPending}>
                  <KeyRound size={16} />
                  Passwort ändern
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted">
                Für dieses Konto ist kein lokales Passwort eingerichtet (Anmeldung nur über ChurchTools/Passkey).
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Darstellung</CardTitle>
          </CardHeader>
          <CardBody>
            <ThemePreferenceControl />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Benachrichtigungen</CardTitle>
          </CardHeader>
          <CardBody>
            <NotificationPreferences />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ThemePreferenceControl() {
  const { me, refreshMe } = useAuth();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: async (theme: ThemePreference) =>
      (await api.put<{ themePreference: ThemePreference }>('/auth/theme', { theme })).data,
    onSuccess: async () => {
      await refreshMe();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const current = me?.themePreference ?? 'system';

  return (
    <div className="flex gap-1 rounded-lg border border-border p-0.5">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => {
            applyTheme(opt.value);
            mutation.mutate(opt.value);
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
            current === opt.value ? 'bg-brand-50 text-brand-700' : 'text-muted'
          }`}
        >
          {opt.value === 'light' && <Sun size={15} />}
          {opt.value === 'dark' && <Moon size={15} />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NotificationPreferences() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: async () => (await api.get<NotificationPreferenceEntry[]>('/notifications/preferences')).data,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) =>
      (await api.put<NotificationPreferenceEntry[]>(`/notifications/preferences/${key}`, { enabled })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(['notifications', 'preferences'], data);
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  if (!query.data || query.data.length === 0) {
    return (
      <p className="text-sm text-muted">
        Für deine aktuellen Berechtigungen sind keine Benachrichtigungs-Ereignisse verfügbar.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {query.data.map((pref) => (
        <li key={pref.key} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-ink">
            <Bell size={14} className="text-muted" />
            {pref.label}
          </span>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={pref.enabled}
              disabled={toggleMutation.isPending}
              onChange={(e) => toggleMutation.mutate({ key: pref.key, enabled: e.target.checked })}
            />
            <div className="h-5 w-9 rounded-full bg-black/15 transition-colors peer-checked:bg-brand-600 peer-disabled:opacity-50" />
            <div className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
          </label>
        </li>
      ))}
    </ul>
  );
}
