import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorCode, getApiErrorMessage } from '@/lib/api-client';
import { useLocations, useOrganizations, useOrganizationUnits, useRooms } from '@/lib/reference-data';
import type { Article } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { DateInput } from '@/components/ui/DateInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';
import { ArticleSearchSelect } from '@/components/ui/ArticleSearchSelect';

const schema = z.object({
  article: z.custom<Article>((v) => !!v, 'Pflichtfeld'),
  locationId: z.string().min(1, 'Pflichtfeld'),
  roomId: z.string().min(1, 'Pflichtfeld'),
  ownerOrganizationId: z.string().min(1, 'Pflichtfeld'),
  ownerUnitId: z.string().min(1, 'Pflichtfeld'),
  inventoryNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  purchasePrice: z.string().optional(),
  purchaseDate: z.string().optional(),
  nextDguvV3Check: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function InventoryItemCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: locations } = useLocations();
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const locationId = watch('locationId');
  const ownerOrganizationId = watch('ownerOrganizationId');
  const { data: rooms } = useRooms(locationId || undefined);
  const { data: organizations } = useOrganizations();
  const { data: units } = useOrganizationUnits(ownerOrganizationId || undefined);

  useEffect(() => {
    if (open) reset({});
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      await api.post('/inventory', {
        articleId: values.article.id,
        locationId: values.locationId,
        roomId: values.roomId,
        ownerOrganizationId: values.ownerOrganizationId,
        ownerUnitId: values.ownerUnitId,
        inventoryNumber: values.inventoryNumber || undefined,
        serialNumber: values.serialNumber || undefined,
        notes: values.notes || undefined,
        purchasePrice: values.purchasePrice ? Number(values.purchasePrice) : undefined,
        purchaseDate: values.purchaseDate || undefined,
        nextDguvV3Check: values.nextDguvV3Check || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.push('Inventarobjekt wurde angelegt.');
      onClose();
    },
    onError: (err) => {
      if (getApiErrorCode(err) === 'DUPLICATE_INVENTORY_NUMBER') {
        setError('inventoryNumber', { type: 'server', message: getApiErrorMessage(err) });
      }
      toast.push(getApiErrorMessage(err), 'error');
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Neues Inventarobjekt" size="lg">
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Field label="Artikel" error={errors.article?.message as string | undefined}>
            <Controller
              name="article"
              control={control}
              render={({ field }) => (
                <ArticleSearchSelect
                  selected={field.value ?? null}
                  onSelect={field.onChange}
                  onClear={() => field.onChange(undefined)}
                />
              )}
            />
          </Field>
        </div>

        <Field label="Inventarnummer (optional)" error={errors.inventoryNumber?.message}>
          <Input {...register('inventoryNumber')} />
        </Field>

        <Field label="Standort" error={errors.locationId?.message}>
          <Select {...register('locationId')} defaultValue="">
            <option value="" disabled>
              Standort wählen …
            </option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Raum" error={errors.roomId?.message}>
          <Select {...register('roomId')} defaultValue="" disabled={!locationId}>
            <option value="" disabled>
              {locationId ? 'Raum wählen …' : 'Zuerst Standort wählen'}
            </option>
            {rooms?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Eigentümer-Organisation" error={errors.ownerOrganizationId?.message}>
          <Select {...register('ownerOrganizationId')} defaultValue="">
            <option value="" disabled>
              Organisation wählen …
            </option>
            {organizations?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Eigentümer-Untereinheit" error={errors.ownerUnitId?.message}>
          <Select {...register('ownerUnitId')} defaultValue="" disabled={!ownerOrganizationId}>
            <option value="" disabled>
              {ownerOrganizationId ? 'Untereinheit wählen …' : 'Zuerst Organisation wählen'}
            </option>
            {units?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Seriennummer (optional)">
          <Input {...register('serialNumber')} />
        </Field>

        <Field label="Anschaffungspreis € (optional)">
          <Input type="number" min={0} step="0.01" {...register('purchasePrice')} />
        </Field>

        <Field label="Anschaffungsdatum (optional)">
          <DateInput {...register('purchaseDate')} />
        </Field>

        <Field label="Nächste DGUV-V3-Prüfung (optional)">
          <DateInput {...register('nextDguvV3Check')} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notizen (optional)">
            <textarea
              className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              rows={2}
              {...register('notes')}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 sm:col-span-2">
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
