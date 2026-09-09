import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Mail, RotateCcw, Send } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { EmailConfig, NotificationTemplate } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/toast';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/RichTextEditor';

type Tab = 'server' | 'templates' | 'footer';

const TABS: { value: Tab; label: string }[] = [
  { value: 'server', label: 'Server' },
  { value: 'templates', label: 'Vorlagen' },
  { value: 'footer', label: 'Fußzeile' },
];

export function EmailSettingsPage() {
  const [tab, setTab] = useState<Tab>('server');

  return (
    <div>
      <PageHeader
        title="E-Mail"
        description="SMTP-Server, Benachrichtigungstexte und die E-Mail-Fußzeile verwalten."
      />

      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={clsx(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'server' && <ServerTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'footer' && <FooterTab />}
    </div>
  );
}

function ServerTab() {
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
      <Card>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
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
          <p className={`text-sm ${testResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{testResult.message}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={saveMutation.isPending}>
            <Mail size={16} />
            Speichern
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TemplatesTab() {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['notifications', 'templates'],
    queryFn: async () => (await api.get<NotificationTemplate[]>('/notifications/templates')).data,
  });

  return (
    <>
      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <EmptyState title="Keine Benachrichtigungstypen gefunden" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.map((t) => (
              <li key={t.eventKey}>
                <button
                  type="button"
                  onClick={() => setEditingKey(t.eventKey)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-canvas"
                >
                  <span className="text-sm font-medium text-ink">{t.label}</span>
                  <span className="flex items-center gap-2">
                    {t.isCustomized && <Badge tone="blue">Angepasst</Badge>}
                    <span className="truncate text-xs text-muted">{t.subject}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editingKey && <TemplateEditModal eventKey={editingKey} onClose={() => setEditingKey(null)} />}
    </>
  );
}

function TemplateEditModal({ eventKey, onClose }: { eventKey: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const bodyEditorRef = useRef<RichTextEditorHandle>(null);

  const query = useQuery({
    queryKey: ['notifications', 'templates', eventKey],
    queryFn: async () => (await api.get<NotificationTemplate>(`/notifications/templates/${eventKey}`)).data,
  });

  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (query.data && !initialized) {
    setSubject(query.data.subject);
    setBodyHtml(query.data.bodyHtml);
    setInitialized(true);
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => api.put(`/notifications/templates/${eventKey}`, { subject, bodyHtml }),
    onSuccess: () => {
      invalidate();
      toast.push('Vorlage wurde gespeichert.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: async () =>
      (await api.put<NotificationTemplate>(`/notifications/templates/${eventKey}/reset`)).data,
    onSuccess: (reset) => {
      invalidate();
      setSubject(reset.subject);
      setBodyHtml(reset.bodyHtml);
      toast.push('Vorlage wurde auf den Standard zurückgesetzt.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (query.isLoading || !query.data) {
    return (
      <Modal open onClose={onClose} title="Vorlage">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={query.data.label} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Betreff">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Inhalt</label>
          <RichTextEditor ref={bodyEditorRef} value={bodyHtml} onChange={setBodyHtml} />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">
            Platzhalter einfügen (in den Inhalt, an der Cursorposition):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {query.data.variables.map((v) => (
              <button
                key={v.key}
                type="button"
                title={v.description}
                onClick={() => bodyEditorRef.current?.insertText(`{{${v.key}}}`)}
                className="rounded-full bg-black/5 px-2.5 py-1 font-mono text-xs text-ink hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          {query.data.isCustomized ? (
            <Button
              type="button"
              variant="ghost"
              loading={resetMutation.isPending}
              onClick={() => {
                if (window.confirm('Diese Vorlage wirklich auf den Standardtext zurücksetzen?')) {
                  resetMutation.mutate();
                }
              }}
            >
              <RotateCcw size={14} />
              Auf Standard zurücksetzen
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              Speichern
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function FooterTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['notifications', 'email-config'],
    queryFn: async () => (await api.get<EmailConfig>('/notifications/email-config')).data,
  });

  const [footerHtml, setFooterHtml] = useState('');
  const [initialized, setInitialized] = useState(false);
  if (query.data && !initialized) {
    setFooterHtml(query.data.footerHtml ?? '');
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => api.put('/notifications/email-config', { footerHtml: footerHtml || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'email-config'] });
      toast.push('Fußzeile wurde gespeichert.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (query.isLoading || !query.data) {
    return (
      <Card>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted">
          Wird am Ende jeder Benachrichtigungs-E-Mail angezeigt. Leer lassen, um den Standardtext
          ("Diese E-Mail wurde automatisch von … versendet.") zu verwenden.
        </p>
        <RichTextEditor value={footerHtml} onChange={setFooterHtml} />
        <div className="flex justify-end">
          <Button type="button" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Speichern
          </Button>
        </div>
      </div>
    </Card>
  );
}
