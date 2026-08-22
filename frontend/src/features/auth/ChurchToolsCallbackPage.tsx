import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { TokenResponse } from '@/lib/api-types';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

export function ChurchToolsCallbackPage() {
  const [params] = useSearchParams();
  const { applyTokens } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) {
      setError('Es fehlen erforderliche Parameter für den ChurchTools-Login.');
      return;
    }

    api
      .get<TokenResponse>('/auth/churchtools/callback', { params: { code, state } })
      .then(async (res) => {
        await applyTokens(res.data);
        navigate('/', { replace: true });
      })
      .catch((err: unknown) => {
        setError(getApiErrorMessage(err, 'ChurchTools-Anmeldung fehlgeschlagen.'));
      });
  }, [params, applyTokens, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
        {error ? (
          <>
            <AlertTriangle className="mx-auto mb-3 text-red-500" size={28} />
            <p className="mb-4 text-sm text-ink">{error}</p>
            <Link to="/login">
              <Button variant="secondary">Zurück zum Login</Button>
            </Link>
          </>
        ) : (
          <>
            <Spinner className="mx-auto mb-3" />
            <p className="text-sm text-muted">ChurchTools-Anmeldung wird abgeschlossen …</p>
          </>
        )}
      </div>
    </div>
  );
}
