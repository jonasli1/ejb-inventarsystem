import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Package } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

const schema = z.object({
  email: z.string().email('Bitte eine gültige E-Mail-Adresse eingeben.'),
});
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const availableQuery = useQuery({
    queryKey: ['auth', 'password-reset-available'],
    queryFn: async () =>
      (await api.get<{ available: boolean }>('/auth/password-reset-available')).data,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await api.post('/auth/forgot-password', values);
      setSent(true);
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'Anfrage fehlgeschlagen.'));
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
            <h1 className="text-lg font-semibold text-ink">Passwort vergessen</h1>
            <p className="text-sm text-muted">
              Wir schicken dir einen Link zum Zurücksetzen per E-Mail.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 className="text-green-600" size={28} />
              <p className="text-sm text-ink">
                Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde soeben eine E-Mail mit
                einem Link zum Zurücksetzen des Passworts verschickt.
              </p>
              <Link to="/login" className="text-sm text-brand-600 hover:underline">
                Zurück zum Login
              </Link>
            </div>
          ) : availableQuery.data && !availableQuery.data.available ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p className="text-sm text-ink">
                Der E-Mail-Versand ist auf diesem System nicht eingerichtet. Bitte wende dich an
                einen Administrator, um dein Passwort zurückzusetzen.
              </p>
              <Link to="/login" className="text-sm text-brand-600 hover:underline">
                Zurück zum Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Field label="E-Mail" error={errors.email?.message}>
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="max@beispiel.de"
                  {...register('email')}
                />
              </Field>

              {serverError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
              )}

              <Button type="submit" loading={isSubmitting} className="w-full">
                Link zum Zurücksetzen senden
              </Button>
              <Link to="/login" className="text-center text-sm text-muted hover:underline">
                Zurück zum Login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
