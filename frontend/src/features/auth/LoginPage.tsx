import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Fingerprint, Package } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { getApiErrorMessage } from '@/lib/api-client';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { isWebAuthnSupported, loginWithPasskey } from './passkey';

const schema = z.object({
  email: z.string().email('Bitte eine gültige E-Mail-Adresse eingeben.'),
  password: z.string().min(1, 'Bitte Passwort eingeben.'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { loginLocal, applyTokens } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [churchToolsLoading, setChurchToolsLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const passwordResetAvailableQuery = useQuery({
    queryKey: ['auth', 'password-reset-available'],
    queryFn: async () =>
      (await api.get<{ available: boolean }>('/auth/password-reset-available')).data,
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await loginLocal(values.email, values.password);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'Anmeldung fehlgeschlagen.'));
    }
  };

  const onChurchTools = async () => {
    setServerError(null);
    setChurchToolsLoading(true);
    try {
      const { data } = await api.get<{ authorizationUrl: string }>('/auth/churchtools/start');
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'ChurchTools-Login konnte nicht gestartet werden.'));
      setChurchToolsLoading(false);
    }
  };

  const onPasskey = async () => {
    setServerError(null);
    setPasskeyLoading(true);
    try {
      const tokens = await loginWithPasskey();
      await applyTokens(tokens);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'Passkey-Anmeldung fehlgeschlagen.'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Package size={22} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink">Inventarsystem</h1>
            <p className="text-sm text-muted">Melde dich an, um fortzufahren</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Field label="E-Mail" error={errors.email?.message}>
              <Input type="email" autoComplete="username" placeholder="max@beispiel.de" {...register('email')} />
            </Field>
            <Field label="Passwort" error={errors.password?.message}>
              <Input type="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} />
            </Field>

            {passwordResetAvailableQuery.data?.available && (
              <Link
                to="/forgot-password"
                className="-mt-2 self-end text-sm text-brand-600 hover:underline"
              >
                Passwort vergessen?
              </Link>
            )}

            {serverError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
            )}

            <Button type="submit" loading={isSubmitting} className="w-full">
              Anmelden
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted">oder</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              loading={churchToolsLoading}
              onClick={() => void onChurchTools()}
            >
              Mit ChurchTools anmelden
            </Button>
            {isWebAuthnSupported() && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                loading={passkeyLoading}
                onClick={() => void onPasskey()}
              >
                <Fingerprint size={16} />
                Mit Passkey anmelden
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
