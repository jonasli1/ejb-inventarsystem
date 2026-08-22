import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useCategories } from '@/lib/reference-data';
import type { Article, ArticleType } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { FileUploadList } from '@/components/ui/FileUploadList';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';

const ARTICLE_TYPES: { value: ArticleType; label: string }[] = [
  { value: 'UNIQUE', label: 'Einzelobjekt' },
  { value: 'BULK', label: 'Mehrfachobjekt' },
  { value: 'CONSUMABLE', label: 'Verbrauchsobjekt' },
];

const schema = z.object({
  name: z.string().min(1, 'Pflichtfeld'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  type: z.enum(['UNIQUE', 'BULK', 'CONSUMABLE']),
  unitOfMeasure: z.string().optional(),
  manufacturer: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

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
  const canManage = hasPermission(PERMISSIONS.ARTICLES_MANAGE);
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
      categoryId: article?.categoryId ?? '',
      type: article?.type ?? 'UNIQUE',
      unitOfMeasure: article?.unitOfMeasure ?? '',
      manufacturer: article?.manufacturer ?? '',
    });
  }, [open, article, reset]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name,
        description: values.description || undefined,
        categoryId: values.categoryId || undefined,
        type: values.type,
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
          <Input {...register('name')} />
        </Field>
        <Field label="Beschreibung (optional)">
          <textarea
            className="w-full rounded-lg border border-border bg-white p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            rows={2}
            {...register('description')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Typ" error={errors.type?.message}>
            <Select {...register('type')} disabled={!!article}>
              {ARTICLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kategorie (optional)">
            <Select {...register('categoryId')} defaultValue="">
              <option value="">Keine</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Einheit (optional)">
            <Input placeholder="z. B. Stück" {...register('unitOfMeasure')} />
          </Field>
          <Field label="Hersteller (optional)">
            <Input {...register('manufacturer')} />
          </Field>
        </div>

        {article ? (
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <ImageUploadField entityType="article" entityId={article.id} canManage={canManage} />
            <FileUploadList
              entityType="article"
              entityId={article.id}
              category="document"
              canManage={canManage}
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
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {article ? 'Speichern' : 'Anlegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
