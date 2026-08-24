import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Save, Trash2, Upload } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { AppSettingsConfig } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';

const SETTINGS_QUERY_KEY = ['settings', 'general'];

function LogoField({ config }: { config: AppSettingsConfig }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/settings/general/logo', formData);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });
  const removeMutation = useMutation({
    mutationFn: async () => api.delete('/settings/general/logo'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">Logo</label>
      <p className="mb-2 text-xs text-muted">
        Erscheint oben links in der Seitenleiste und als Favicon im Browser-Tab.
      </p>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-canvas">
          {config.logoDataUrl ? (
            <img src={config.logoDataUrl} alt="Logo" className="h-full w-full object-contain" />
          ) : (
            <ImageOff size={20} className="text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            {config.logoDataUrl ? 'Ersetzen' : 'Hochladen'}
          </Button>
          {config.logoDataUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              <Trash2 size={14} />
              Entfernen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GeneralSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => (await api.get<AppSettingsConfig>('/settings/general')).data,
  });
  const config = query.data;

  const [displayName, setDisplayName] = useState('');
  const [churchToolsEnabled, setChurchToolsEnabled] = useState(true);
  const [passkeyEnabled, setPasskeyEnabled] = useState(true);
  const [formInitialized, setFormInitialized] = useState(false);

  if (config && !formInitialized) {
    setDisplayName(config.displayName);
    setChurchToolsEnabled(config.churchToolsEnabled);
    setPasskeyEnabled(config.passkeyEnabled);
    setFormInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.put('/settings/general', { displayName, churchToolsEnabled, passkeyEnabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      toast.push('Einstellungen gespeichert.');
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
        title="Allgemeine Einstellungen"
        description="Name, Logo und verfügbare Anmeldemethoden für dieses System."
      />

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="flex flex-col gap-5 p-4"
        >
          <Field label="Name">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Inventarsystem"
              required
            />
          </Field>

          <LogoField config={config} />

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-ink">Anmeldemethoden</h3>
            <p className="text-xs text-muted">
              Deaktivierte Methoden werden auf der Login-Seite ausgeblendet und serverseitig
              abgelehnt – z. B. sinnvoll, solange ChurchTools noch nicht eingerichtet ist.
            </p>
            <label className="mt-1 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={churchToolsEnabled}
                onChange={(e) => setChurchToolsEnabled(e.target.checked)}
              />
              ChurchTools-Login aktiviert
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={passkeyEnabled}
                onChange={(e) => setPasskeyEnabled(e.target.checked)}
              />
              Passkey-Login aktiviert
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={saveMutation.isPending}>
              <Save size={16} />
              Speichern
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
