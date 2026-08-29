import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Article, InventoryItem, Loan, LoanTemplate } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';
import { ItemSearchSelect } from '@/components/ui/ItemSearchSelect';
import { useAuth } from '@/auth/useAuth';
import { isPermitted, PERMISSIONS } from '@/lib/permissions';

type ItemMode = 'article' | 'item' | '';

interface ItemRow {
  mode: ItemMode;
  articleId: string;
  quantity: number;
  inventoryItemId: string;
  label: string;
}

function emptyRow(): ItemRow {
  return { mode: '', articleId: '', quantity: 1, inventoryItemId: '', label: '' };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LoanCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (loan: Loan) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canPreApprove = isPermitted(hasPermission, [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER]);
  const canAdminister = isPermitted(hasPermission, PERMISSIONS.LOANS_ADMINISTER);

  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerStreet, setBorrowerStreet] = useState('');
  const [borrowerCity, setBorrowerCity] = useState('');
  const [borrowerEmail, setBorrowerEmail] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [checkoutDate, setCheckoutDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [forceRequested, setForceRequested] = useState(false);
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [templateId, setTemplateId] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['loan-templates'],
    queryFn: async () => (await api.get<LoanTemplate[]>('/loans/templates')).data,
    enabled: open && canAdminister,
  });

  const reset = () => {
    setBorrowerName('');
    setBorrowerStreet('');
    setBorrowerCity('');
    setBorrowerEmail('');
    setBorrowerPhone('');
    setCheckoutDate(todayIso());
    setDueDate('');
    setNotes('');
    setForceRequested(false);
    setItems([emptyRow()]);
    setTemplateId('');
    setSaveAsTemplate(false);
    setTemplateName('');
    setError(null);
  };

  const applyTemplate = (template: LoanTemplate) => {
    setItems(
      template.items.map((i) => ({
        mode: 'article',
        articleId: i.articleId,
        quantity: i.quantity,
        inventoryItemId: '',
        label: `${i.article.name} (nach Menge)`,
      })),
    );
  };

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<Loan>('/loans', {
          borrowerName,
          borrowerStreet: borrowerStreet || undefined,
          borrowerCity: borrowerCity || undefined,
          borrowerEmail: borrowerEmail || undefined,
          borrowerPhone: borrowerPhone || undefined,
          checkoutDate: checkoutDate || undefined,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          ...(canPreApprove ? { forceRequested } : {}),
          ...(canAdminister && saveAsTemplate && templateName.trim()
            ? { saveAsTemplate: { name: templateName.trim() } }
            : {}),
          items: items
            .filter((i) => (i.mode === 'article' ? i.articleId : i.inventoryItemId))
            .map((i) =>
              i.mode === 'article'
                ? { articleId: i.articleId, quantity: i.quantity }
                : { inventoryItemId: i.inventoryItemId },
            ),
        })
      ).data,
    onSuccess: (loan) => {
      void queryClient.invalidateQueries({ queryKey: ['loans'] });
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['count'] });
      void queryClient.invalidateQueries({ queryKey: ['loan-templates'] });
      toast.push('Ausleihe wurde erstellt.');
      reset();
      onClose();
      onCreated?.(loan);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === index ? { ...it, ...patch } : it));
      // Once the last row has a selection, reveal a fresh empty row
      // automatically instead of requiring a manual "Objekt hinzufügen" click.
      const isLastRow = index === next.length - 1;
      if (isLastRow && next[index].mode !== '') {
        next.push(emptyRow());
      }
      return next;
    });
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Neue Ausleihe"
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!borrowerName.trim()) {
            setError('Bitte einen Ausleiher angeben.');
            return;
          }
          if (items.every((i) => (i.mode === 'article' ? !i.articleId : !i.inventoryItemId))) {
            setError('Bitte mindestens ein Objekt auswählen.');
            return;
          }
          mutation.mutate();
        }}
        className="flex flex-col gap-4"
        autoComplete="off"
      >
        {canAdminister && templatesQuery.data && templatesQuery.data.length > 0 && (
          <Field label="Aus Vorlage erstellen">
            <Select
              value={templateId}
              onChange={(e) => {
                const id = e.target.value;
                setTemplateId(id);
                const template = templatesQuery.data?.find((t) => t.id === id);
                if (template) applyTemplate(template);
              }}
            >
              <option value="">Keine Vorlage</option>
              {templatesQuery.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ausleiher (Name)">
            <Input
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
              placeholder="Max Mustermann"
              autoComplete="off"
            />
          </Field>
          <Field label="Geplantes Ausgabedatum">
            <Input
              type="date"
              value={checkoutDate}
              onChange={(e) => setCheckoutDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Rückgabe fällig am">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Straße, Hausnummer">
            <Input
              value={borrowerStreet}
              onChange={(e) => setBorrowerStreet(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="PLZ, Ort">
            <Input
              value={borrowerCity}
              onChange={(e) => setBorrowerCity(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="E-Mail">
            <Input
              type="email"
              value={borrowerEmail}
              onChange={(e) => setBorrowerEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Handynummer">
            <Input
              value={borrowerPhone}
              onChange={(e) => setBorrowerPhone(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Objekte</label>
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <ItemSearchSelect
                  selectedLabel={item.label}
                  onSelectItem={(inventoryItem: InventoryItem) =>
                    updateItem(index, {
                      mode: 'item',
                      inventoryItemId: inventoryItem.id,
                      articleId: '',
                      label: `${inventoryItem.inventoryNumber} — ${inventoryItem.article.name}`,
                    })
                  }
                  onSelectArticle={(article: Article) =>
                    updateItem(index, {
                      mode: 'article',
                      articleId: article.id,
                      inventoryItemId: '',
                      quantity: 1,
                      label: `${article.name} (nach Menge)`,
                    })
                  }
                  onClear={() =>
                    updateItem(index, {
                      mode: '',
                      articleId: '',
                      inventoryItemId: '',
                      label: '',
                    })
                  }
                />

                {item.mode === 'article' && (
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: Number(e.target.value) || 1 })}
                    className="w-20"
                  />
                )}

                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="mt-1.5 p-1.5 text-muted hover:text-red-600"
                  disabled={items.length === 1}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setItems((prev) => [...prev, emptyRow()])}
          >
            <Plus size={14} />
            Objekt hinzufügen
          </Button>
        </div>

        <Field label="Notizen (optional)">
          <textarea
            className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {canPreApprove && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={forceRequested}
              onChange={(e) => setForceRequested(e.target.checked)}
            />
            Trotz Berechtigung nur als &bdquo;beantragt&ldquo; anlegen (keine automatische Genehmigung)
          </label>
        )}

        {canAdminister && (
          <div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
              />
              Objekte zusätzlich als Vorlage speichern
            </label>
            {saveAsTemplate && (
              <div className="mt-2 max-w-xs">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Name der Vorlage"
                  required={saveAsTemplate}
                />
              </div>
            )}
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Ausleihe erstellen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
