import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useCategories } from '@/lib/reference-data';
import type { Article } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { FileUploadList } from '@/components/ui/FileUploadList';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';

const schema = z.object({
  name: z.string().min(1, 'Pflichtfeld'),
  description: z.string().optional(),
  notes: z.string().optional(),
  aliases: z.string().optional(),
  categoryId: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  manufacturer: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function aliasesToString(aliases: string[]): string {
  return aliases.join(', ');
}

function parseAliases(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  const list = value
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export function ArticleFormModal({
  open,
  onClose,
  article,
}: {
  open: boolean;
  onClose: () => void;
  article?: Article | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canSubmit = hasPermission(article ? PERMISSIONS.ARTICLES_UPDATE : PERMISSIONS.ARTICLES_CREATE);
  const canManageAttachments = hasPermission(PERMISSIONS.ARTICLES_UPDATE);
  const { data: categories } = useCategories();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      name: article?.name ?? '',
      description: article?.description ?? '',
      notes: article?.notes ?? '',
      aliases: article ? aliasesToString(article.aliases) : '',
      categoryId: article?.categoryId ?? '',
      unitOfMeasure: article?.unitOfMeasure ?? '',
      manufacturer: article?.manufacturer ?? '',
    });
  }, [open, article, reset]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name,
        description: values.description || undefined,
        notes: values.notes || undefined,
        aliases: parseAliases(values.aliases),
        categoryId: values.categoryId || undefined,
        unitOfMeasure: values.unitOfMeasure || undefined,
        manufacturer: values.manufacturer || undefined,
      };
      if (article) {
        await api.put(`/articles/${article.id}`, payload);
      } else {
        await api.post('/articles', payload);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.push(article ? 'Artikel wurde aktualisiert.' : 'Artikel wurde angelegt.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title={article ? 'Artikel bearbeiten' : 'Neuer Artikel'}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
        <Field label="Name" error={errors.name?.message}>
          <Input {...register('name')} disabled={!canSubmit} />
        </Field>
        <Field label="Kosenamen / Aliase (optional, durch Komma getrennt)">
          <Input placeholder="z. B. Beamer, Projektor" {...register('aliases')} disabled={!canSubmit} />
        </Field>
        <Field label="Beschreibung (optional)">
          <textarea
            className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-canvas"
            rows={2}
            disabled={!canSubmit}
            {...register('description')}
          />
        </Field>
        <Field label="Interne Notizen (optional, auch am Inventarobjekt sichtbar)">
          <textarea
            className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-canvas"
            rows={2}
            disabled={!canSubmit}
            {...register('notes')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kategorie (optional)">
            <Select {...register('categoryId')} defaultValue="" disabled={!canSubmit}>
              <option value="">Keine</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Einheit (optional)">
            <Input placeholder="z. B. Stück" {...register('unitOfMeasure')} disabled={!canSubmit} />
          </Field>
          <Field label="Hersteller (optional)">
            <Input {...register('manufacturer')} disabled={!canSubmit} />
          </Field>
        </div>

        {article ? (
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <ImageUploadField entityType="article" entityId={article.id} canManage={canManageAttachments} />
            <FileUploadList
              entityType="article"
              entityId={article.id}
              category="document"
              canManage={canManageAttachments}
              title="Dokumente (Betriebsanleitung usw.)"
            />
          </div>
        ) : (
          <p className="text-xs text-muted">
            Produktfoto und Dokumente können nach dem Anlegen hinzugefügt werden.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          {canSubmit && (
            <Button type="submit" loading={isSubmitting || mutation.isPending}>
              {article ? 'Speichern' : 'Anlegen'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
