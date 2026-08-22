import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

export function OneDriveCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get('code');
    if (!code) {
      setError('Es fehlt der erforderliche "code"-Parameter von Microsoft.');
      return;
    }

    api
      .post('/backup/onedrive/callback', { code })
      .then(() => navigate('/settings/backup', { replace: true }))
      .catch((err: unknown) => setError(getApiErrorMessage(err, 'OneDrive-Verbindung fehlgeschlagen.')));
  }, [params, navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
        {error ? (
          <>
            <AlertTriangle className="mx-auto mb-3 text-red-500" size={28} />
            <p className="mb-4 text-sm text-ink">{error}</p>
            <Button variant="secondary" onClick={() => navigate('/settings/backup')}>
              Zurück zu Backup
            </Button>
          </>
        ) : (
          <>
            <Spinner className="mx-auto mb-3" />
            <p className="text-sm text-muted">OneDrive-Verbindung wird abgeschlossen …</p>
          </>
        )}
      </div>
    </div>
  );
}
