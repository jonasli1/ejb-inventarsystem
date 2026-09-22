import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Article, InventoryItem, InventoryItemDetail, Loan } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ItemSearchSelect } from '@/components/ui/ItemSearchSelect';
import { useToast } from '@/components/ui/toast';
import { groupBounds, moveGroup } from '@/features/loans/itemRowGroups';

type ItemMode = 'article' | 'item';

interface EditableItem {
  mode: ItemMode;
  articleId: string;
  quantity: number | '';
  inventoryItemId: string;
  label: string;
  /** Set when this row was auto-added because it's accessory of another row's inventoryItemId. */
  accessoryOfItemId?: string;
}

/**
 * Seeds the editable row list from the loan's already-resolved items -
 * consecutive non-accessory items sharing the same article are grouped back
 * into a single "by quantity" row (so a quantity originally requested via
 * articleId+quantity can simply be edited as a number), everything else
 * shows as an individual item row.
 */
function initialItems(loan: Loan): EditableItem[] {
  const idsInLoan = new Set(loan.items.map((i) => i.inventoryItemId));
  const rows: EditableItem[] = [];
  const items = loan.items;
  for (let i = 0; i < items.length; ) {
    const current = items[i];
    const isAccessory =
      current.inventoryItem.parentItemId && idsInLoan.has(current.inventoryItem.parentItemId);
    if (isAccessory) {
      rows.push({
        mode: 'item',
        articleId: '',
        quantity: 1,
        inventoryItemId: current.inventoryItemId,
        label: current.inventoryItem.inventoryNumber
          ? `${current.inventoryItem.inventoryNumber} — ${current.inventoryItem.article.name}`
          : current.inventoryItem.article.name,
        accessoryOfItemId: current.inventoryItem.parentItemId!,
      });
      i++;
      continue;
    }
    // A quantity-loanable article is always shown as a single "by quantity"
    // row (even with just one unit) so it's recognized as the same row when
    // more units of it are added later - keying this off the article's own
    // flag rather than "are there currently >1 consecutive units" is what
    // keeps re-adding the same article from ever producing a second,
    // separate row for it.
    if (current.inventoryItem.article.loanableByQuantity) {
      let j = i;
      while (
        j < items.length &&
        items[j].inventoryItem.articleId === current.inventoryItem.articleId &&
        !(items[j].inventoryItem.parentItemId && idsInLoan.has(items[j].inventoryItem.parentItemId!))
      ) {
        j++;
      }
      rows.push({
        mode: 'article',
        articleId: current.inventoryItem.articleId,
        quantity: j - i,
        inventoryItemId: '',
        label: `${current.inventoryItem.article.name} (nach Menge)`,
      });
      i = j;
    } else {
      rows.push({
        mode: 'item',
        articleId: '',
        quantity: 1,
        inventoryItemId: current.inventoryItemId,
        label: current.inventoryItem.inventoryNumber
          ? `${current.inventoryItem.inventoryNumber} — ${current.inventoryItem.article.name}`
          : current.inventoryItem.article.name,
      });
      i++;
    }
  }
  return rows;
}

export function LoanEditModal({
  loan,
  onClose,
  onSaved,
}: {
  loan: Loan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [subject, setSubject] = useState(loan.subject);
  const [borrowerName, setBorrowerName] = useState(loan.borrowerName ?? '');
  const [borrowerStreet, setBorrowerStreet] = useState(loan.borrowerStreet ?? '');
  const [borrowerCity, setBorrowerCity] = useState(loan.borrowerCity ?? '');
  const [borrowerEmail, setBorrowerEmail] = useState(loan.borrowerEmail ?? '');
  const [borrowerPhone, setBorrowerPhone] = useState(loan.borrowerPhone ?? '');
  const [checkoutDate, setCheckoutDate] = useState(loan.checkoutDate.slice(0, 10));
  const [dueDate, setDueDate] = useState(loan.dueDate?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(loan.notes ?? '');
  const [items, setItems] = useState<EditableItem[]>(() => initialItems(loan));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      api.put(`/loans/${loan.id}`, {
        subject,
        borrowerName: borrowerName || undefined,
        borrowerStreet: borrowerStreet || undefined,
        borrowerCity: borrowerCity || undefined,
        borrowerEmail: borrowerEmail || undefined,
        borrowerPhone: borrowerPhone || undefined,
        checkoutDate: checkoutDate || undefined,
        dueDate: dueDate || undefined,
        // Sent as-is (not `notes || undefined`) so clearing the textarea to
        // empty actually reaches the backend and clears the stored note -
        // this is a fully-seeded edit form, there's no "leave untouched"
        // case to preserve by omitting the field.
        notes,
        items: items.map((i) =>
          i.mode === 'article'
            ? { articleId: i.articleId, quantity: i.quantity === '' || i.quantity < 1 ? 1 : i.quantity }
            : { inventoryItemId: i.inventoryItemId },
        ),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loans'] });
      toast.push('Ausleihe wurde aktualisiert.');
      onSaved();
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const updateItem = (index: number, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  // Inventory items with accessories are automatically loaned out together -
  // fetch the picked item's accessories and add a row per accessory, tagged
  // so they're shown/removed as a unit with their main object.
  const addAccessoryRows = async (parentItemId: string) => {
    try {
      const detail = (await api.get<InventoryItemDetail>(`/inventory/${parentItemId}`)).data;
      if (detail.accessories.length === 0) return;
      setItems((prev) => {
        const parentIndex = prev.findIndex((r) => r.inventoryItemId === parentItemId && r.mode === 'item');
        if (parentIndex === -1) return prev;
        const existingIds = new Set(prev.map((r) => r.inventoryItemId).filter(Boolean));
        const accessoryRows: EditableItem[] = detail.accessories
          .filter((a) => !existingIds.has(a.id))
          .map((a) => ({
            mode: 'item',
            articleId: '',
            quantity: 1,
            inventoryItemId: a.id,
            label: a.inventoryNumber ? `${a.inventoryNumber} — ${a.article.name}` : a.article.name,
            accessoryOfItemId: parentItemId,
          }));
        if (accessoryRows.length === 0) return prev;
        const next = [...prev];
        next.splice(parentIndex + 1, 0, ...accessoryRows);
        return next;
      });
    } catch {
      // Best-effort preview only - the backend still bundles accessories
      // automatically at submit time even if this lookup fails.
    }
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const removed = prev[index];
      return prev.filter((it, i) => {
        if (i === index) return false;
        // Removing a main object cascades to its auto-added accessory rows.
        if (removed.inventoryItemId && it.accessoryOfItemId === removed.inventoryItemId) return false;
        return true;
      });
    });
  };

  return (
    <Modal open onClose={onClose} title={`Bearbeiten – ${loan.subject}`} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!subject.trim()) {
            setError('Bitte einen Betreff angeben.');
            return;
          }
          if (items.length === 0) {
            setError('Bitte mindestens ein Objekt behalten.');
            return;
          }
          mutation.mutate();
        }}
        className="flex flex-col gap-4"
        autoComplete="off"
      >
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          {loan.status === 'issued'
            ? 'Diese Ausleihe wurde bereits ausgegeben; Änderungen setzen den Status nicht zurück.'
            : 'Änderungen setzen den Genehmigungsstatus dieser Ausleihe zurück auf "beantragt" – sie muss danach erneut genehmigt werden.'}
        </p>

        <Field label="Betreff">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} autoComplete="off" required />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ausleiher (Name)">
            <Input value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Geplantes Ausgabedatum">
            <Input type="date" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} required />
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
                <div className="flex flex-1 items-center gap-2 truncate rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink">
                  <span className="truncate">{item.label}</span>
                  {item.accessoryOfItemId && (
                    <Badge tone="blue" className="shrink-0">
                      Zubehör
                    </Badge>
                  )}
                </div>

                {item.mode === 'article' && (
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateItem(index, { quantity: raw === '' ? '' : Number(raw) });
                    }}
                    onBlur={() => {
                      if (item.quantity === '' || item.quantity < 1) updateItem(index, { quantity: 1 });
                    }}
                    className="w-20"
                  />
                )}

                {!item.accessoryOfItemId && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      title="Nach oben"
                      onClick={() => setItems((prev) => moveGroup(prev, index, -1))}
                      className="p-0.5 text-muted hover:text-ink disabled:opacity-30"
                      disabled={groupBounds(items, index)[0] === 0}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      title="Nach unten"
                      onClick={() => setItems((prev) => moveGroup(prev, index, 1))}
                      className="p-0.5 text-muted hover:text-ink disabled:opacity-30"
                      disabled={groupBounds(items, index)[1] === items.length - 1}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="p-1.5 text-muted hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <ItemSearchSelect
              selectedLabel=""
              onSelectItem={(inventoryItem: InventoryItem) => {
                if (items.some((i) => i.inventoryItemId === inventoryItem.id)) return;
                setItems((prev) => [
                  ...prev,
                  {
                    mode: 'item',
                    articleId: '',
                    quantity: 1,
                    inventoryItemId: inventoryItem.id,
                    label: inventoryItem.inventoryNumber
                      ? `${inventoryItem.inventoryNumber} — ${inventoryItem.article.name}`
                      : inventoryItem.article.name,
                  },
                ]);
                void addAccessoryRows(inventoryItem.id);
              }}
              onSelectArticle={(article: Article) => {
                setItems((prev) => {
                  const existingIndex = prev.findIndex(
                    (i) => i.mode === 'article' && i.articleId === article.id,
                  );
                  if (existingIndex !== -1) {
                    return prev.map((it, i) =>
                      i === existingIndex
                        ? { ...it, quantity: (it.quantity === '' ? 1 : it.quantity) + 1 }
                        : it,
                    );
                  }
                  return [
                    ...prev,
                    {
                      mode: 'article',
                      articleId: article.id,
                      quantity: 1,
                      inventoryItemId: '',
                      label: `${article.name} (nach Menge)`,
                    },
                  ];
                });
              }}
              onClear={() => undefined}
              placeholder="Objekt hinzufügen …"
            />
          </div>
        </div>

        <Field label="Notizen (optional)">
          <textarea
            className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Speichern
          </Button>
        </div>
      </form>
    </Modal>
  );
}
