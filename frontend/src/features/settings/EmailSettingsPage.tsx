import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Send } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { EmailConfig } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';

export function EmailSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [testAddress, setTestAddress] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const query = useQuery({
    queryKey: ['notifications', 'email-config'],
    queryFn: async () => (await api.get<EmailConfig>('/notifications/email-config')).data,
  });
  const config = query.data;

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [formInitialized, setFormInitialized] = useState(false);

  if (config && !formInitialized) {
    setEnabled(config.enabled);
    setHost(config.host ?? '');
    setPort(config.port?.toString() ?? '587');
    setSecure(config.secure);
    setUsername(config.username ?? '');
    setFromAddress(config.fromAddress ?? '');
    setFromName(config.fromName ?? '');
    setFormInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.put('/notifications/email-config', {
        enabled,
        host: host || undefined,
        port: port ? Number(port) : undefined,
        secure,
        username: username || undefined,
        password: password || undefined,
        fromAddress: fromAddress || undefined,
        fromName: fromName || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'email-config'] });
      setPassword('');
      toast.push('E-Mail-Konfiguration gespeichert.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const testMutation = useMutation({
    mutationFn: async () => api.post('/notifications/email-config/test', { toAddress: testAddress }),
    onSuccess: () => setTestResult({ ok: true, message: `Test-E-Mail an ${testAddress} wurde verschickt.` }),
    onError: (err) => setTestResult({ ok: false, message: getApiErrorMessage(err) }),
  });

  if (query.isLoading || !config) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="E-Mail-Server"
        description="SMTP-Server konfigurieren, über den Benachrichtigungs-E-Mails verschickt werden."
      />

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="flex flex-col gap-4 p-4"
        >
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            E-Mail-Versand aktiv
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="SMTP-Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
            </Field>
            <Field label="Port">
              <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
            </Field>
            <Field label="Benutzername">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label={config.passwordSet ? 'Passwort (unverändert lassen = beibehalten)' : 'Passwort'}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Absenderadresse">
              <Input
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="inventarsystem@example.com"
              />
            </Field>
            <Field label="Absendername">
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Inventarsystem" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
            TLS verwenden (üblich für Port 465; bei 587/25 mit STARTTLS deaktivieren)
          </label>

          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div className="min-w-[220px] flex-1">
              <Field label="Test-E-Mail an">
                <Input
                  type="email"
                  value={testAddress}
                  onChange={(e) => setTestAddress(e.target.value)}
                  placeholder="test@example.com"
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!testAddress}
              loading={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              <Send size={14} />
              Test-E-Mail senden
            </Button>
          </div>

          {testResult && (
            <p className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>{testResult.message}</p>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={saveMutation.isPending}>
              <Mail size={16} />
              Speichern
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
