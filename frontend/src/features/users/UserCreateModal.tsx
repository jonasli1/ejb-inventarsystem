import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';

const schema = z.object({
  email: z.string().email('Bitte eine gültige E-Mail-Adresse eingeben.'),
  displayName: z.string().min(1, 'Pflichtfeld'),
  password: z
    .string()
    .min(8, 'Mindestens 8 Zeichen.')
    .optional()
    .or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

export function UserCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) =>
      api.post('/users', {
        email: values.email,
        displayName: values.displayName,
        password: values.password || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.push('Benutzer wurde angelegt.');
      reset();
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Neuer Benutzer" size="sm">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
        <Field label="E-Mail" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="Name" error={errors.displayName?.message}>
          <Input {...register('displayName')} />
        </Field>
        <Field label="Lokales Passwort (optional)" error={errors.password?.message}>
          <Input type="password" placeholder="Ohne Passwort: nur ChurchTools/Passkey-Login möglich" {...register('password')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            Anlegen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
