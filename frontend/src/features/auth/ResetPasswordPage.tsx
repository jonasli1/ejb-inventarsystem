import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

const schema = z
  .object({
    newPassword: z.string().min(8, 'Mindestens 8 Zeichen.'),
    newPasswordConfirmation: z.string().min(8, 'Mindestens 8 Zeichen.'),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirmation, {
    message: 'Die Passwörter stimmen nicht überein.',
    path: ['newPasswordConfirmation'],
  });
type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!token) return;
    setServerError(null);
    try {
      await api.post('/auth/reset-password', { token, ...values });
      setDone(true);
    } catch (err) {
      setServerError(
        getApiErrorMessage(err, 'Der Link ist ungültig oder abgelaufen.'),
      );
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
            <h1 className="text-lg font-semibold text-ink">Neues Passwort festlegen</h1>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          {!token ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <AlertTriangle className="text-red-500" size={28} />
              <p className="text-sm text-ink">
                Dieser Link ist unvollständig. Bitte fordere einen neuen Link zum Zurücksetzen
                deines Passworts an.
              </p>
              <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">
                Neuen Link anfordern
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 className="text-green-600" size={28} />
              <p className="text-sm text-ink">
                Dein Passwort wurde geändert. Du kannst dich jetzt damit anmelden.
              </p>
              <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
                Zum Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Field label="Neues Passwort" error={errors.newPassword?.message}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  {...register('newPassword')}
                />
              </Field>
              <Field
                label="Neues Passwort bestätigen"
                error={errors.newPasswordConfirmation?.message}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  {...register('newPasswordConfirmation')}
                />
              </Field>

              {serverError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
              )}

              <Button type="submit" loading={isSubmitting} className="w-full">
                Passwort ändern
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
