import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, Download, Link2, Upload } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { downloadExport } from '@/lib/export';
import type { BackupConfig, BackupDestinationType, BackupFrequency } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { BACKUP_FREQUENCY_LABEL } from '@/lib/status-labels';

const CONFIRM_PHRASE = 'ÜBERSCHREIBEN';

export function BackupPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmText, setConfirmText] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const query = useQuery({
    queryKey: ['backup', 'config'],
    queryFn: async () => (await api.get<BackupConfig>('/backup/config')).data,
  });
  const config = query.data;

  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<BackupFrequency>('weekly');
  const [destinationType, setDestinationType] = useState<BackupDestinationType | ''>('');
  const [sftpHost, setSftpHost] = useState('');
  const [sftpPort, setSftpPort] = useState('22');
  const [sftpUsername, setSftpUsername] = useState('');
  const [sftpPassword, setSftpPassword] = useState('');
  const [sftpRemotePath, setSftpRemotePath] = useState('');
  const [onedriveFolderPath, setOnedriveFolderPath] = useState('');
  const [formInitialized, setFormInitialized] = useState(false);

  if (config && !formInitialized) {
    setEnabled(config.enabled);
    setFrequency(config.frequency);
    setDestinationType(config.destinationType ?? '');
    setSftpHost(config.sftpHost ?? '');
    setSftpPort(config.sftpPort?.toString() ?? '22');
    setSftpUsername(config.sftpUsername ?? '');
    setSftpRemotePath(config.sftpRemotePath ?? '');
    setOnedriveFolderPath(config.onedriveFolderPath ?? '');
    setFormInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.put('/backup/config', {
        enabled,
        frequency,
        destinationType: destinationType || undefined,
        sftpHost: sftpHost || undefined,
        sftpPort: sftpPort ? Number(sftpPort) : undefined,
        sftpUsername: sftpUsername || undefined,
        sftpPassword: sftpPassword || undefined,
        sftpRemotePath: sftpRemotePath || undefined,
        onedriveFolderPath: onedriveFolderPath || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backup', 'config'] });
      setSftpPassword('');
      toast.push('Backup-Konfiguration gespeichert.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const testMutation = useMutation({
    mutationFn: async () => (await api.post<{ ok: boolean; message: string }>('/backup/config/test')).data,
    onSuccess: (result) => setTestResult(result),
    onError: (err) => setTestResult({ ok: false, message: getApiErrorMessage(err) }),
  });

  const connectOneDriveMutation = useMutation({
    mutationFn: async () => (await api.get<{ url: string }>('/backup/onedrive/authorize-url')).data,
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/backup/import', formData);
    },
    onSuccess: () => {
      toast.push('Backup wurde eingespielt. Bitte die Seite neu laden.');
      setPendingFile(null);
      setConfirmText('');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
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
        title="Backup"
        description="Manuelles Backup herunterladen/einspielen und automatische Backups konfigurieren."
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-semibold text-ink">Manuelles Backup</h3>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => downloadExport('/backup/export', {}, 'inventarsystem-backup.tar.gz')}
            >
              <Download size={15} />
              Backup herunterladen
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".gz,.tar,.tar.gz"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPendingFile(file);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} />
              Backup-Datei auswählen …
            </Button>
          </div>

          {pendingFile && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-500/10">
              <div className="mb-2 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>Achtung:</strong> Das Einspielen von &bdquo;{pendingFile.name}&ldquo; überschreibt
                  <strong> alle</strong> aktuellen Daten (Datenbank und Dateien) unwiderruflich. Zur
                  Bestätigung bitte <code className="rounded bg-black/10 px-1">{CONFIRM_PHRASE}</code>{' '}
                  eingeben.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="max-w-xs"
                />
                <Button
                  variant="danger"
                  disabled={confirmText !== CONFIRM_PHRASE}
                  loading={importMutation.isPending}
                  onClick={() => importMutation.mutate(pendingFile)}
                >
                  Jetzt überschreiben
                </Button>
                <Button variant="ghost" onClick={() => { setPendingFile(null); setConfirmText(''); }}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="flex flex-col gap-4 p-4"
        >
          <h3 className="text-sm font-semibold text-ink">Automatisches Backup</h3>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Automatisches Backup aktiv
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Häufigkeit">
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as BackupFrequency)}>
                {(['daily', 'weekly', 'monthly'] as BackupFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {BACKUP_FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ziel">
              <Select
                value={destinationType}
                onChange={(e) => setDestinationType(e.target.value as BackupDestinationType | '')}
              >
                <option value="">Kein Ziel gewählt</option>
                <option value="sftp">SFTP</option>
                <option value="onedrive">OneDrive</option>
              </Select>
            </Field>
          </div>

          {destinationType === 'sftp' && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Field label="Host">
                <Input value={sftpHost} onChange={(e) => setSftpHost(e.target.value)} />
              </Field>
              <Field label="Port">
                <Input type="number" value={sftpPort} onChange={(e) => setSftpPort(e.target.value)} />
              </Field>
              <Field label="Benutzername">
                <Input value={sftpUsername} onChange={(e) => setSftpUsername(e.target.value)} />
              </Field>
              <Field label={config.sftpPasswordSet ? 'Passwort (unverändert lassen = beibehalten)' : 'Passwort'}>
                <Input
                  type="password"
                  value={sftpPassword}
                  onChange={(e) => setSftpPassword(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Zielverzeichnis">
                  <Input value={sftpRemotePath} onChange={(e) => setSftpRemotePath(e.target.value)} placeholder="/backups" />
                </Field>
              </div>
            </div>
          )}

          {destinationType === 'onedrive' && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              {!config.onedriveConfigured ? (
                <p className="text-xs text-amber-700">
                  OneDrive ist serverseitig nicht konfiguriert (MS_CLIENT_ID/MS_CLIENT_SECRET fehlen).
                </p>
              ) : (
                <div className="flex items-center gap-3">
                  <Badge tone={config.onedriveConnected ? 'green' : 'neutral'}>
                    {config.onedriveConnected ? 'Verbunden' : 'Nicht verbunden'}
                  </Badge>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={connectOneDriveMutation.isPending}
                    onClick={() => connectOneDriveMutation.mutate()}
                  >
                    <Link2 size={14} />
                    {config.onedriveConnected ? 'Neu verbinden' : 'OneDrive verbinden'}
                  </Button>
                </div>
              )}
              <Field label="Zielordner">
                <Input
                  value={onedriveFolderPath}
                  onChange={(e) => setOnedriveFolderPath(e.target.value)}
                  placeholder="/Backups/Inventarsystem"
                />
              </Field>
            </div>
          )}

          {config.lastRunAt && (
            <p className="text-xs text-muted">
              Letzter Lauf: {format(new Date(config.lastRunAt), 'dd.MM.yyyy HH:mm')} –{' '}
              <span className={config.lastRunStatus === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                {config.lastRunStatus === 'success' ? 'erfolgreich' : 'Fehler'}
              </span>
              {config.lastRunMessage ? ` (${config.lastRunMessage})` : ''}
            </p>
          )}

          {testResult && (
            <p className={`text-sm ${testResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
              {testResult.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              loading={testMutation.isPending}
              disabled={!destinationType}
              onClick={() => testMutation.mutate()}
            >
              Verbindung testen
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              Speichern
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
