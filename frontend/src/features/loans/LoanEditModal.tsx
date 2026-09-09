import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { InventoryItemDetail, Loan } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ItemSearchSelect } from '@/components/ui/ItemSearchSelect';
import { useToast } from '@/components/ui/toast';

interface EditableItem {
  inventoryItemId: string;
  label: string;
  /** Set when this row was auto-added because it's accessory of another row's inventoryItemId. */
  accessoryOfItemId?: string;
}

function initialItems(loan: Loan): EditableItem[] {
  const idsInLoan = new Set(loan.items.map((i) => i.inventoryItemId));
  return loan.items.map((i) => ({
    inventoryItemId: i.inventoryItemId,
    label: i.inventoryItem.inventoryNumber
      ? `${i.inventoryItem.inventoryNumber} — ${i.inventoryItem.article.name}`
      : i.inventoryItem.article.name,
    accessoryOfItemId:
      i.inventoryItem.parentItemId && idsInLoan.has(i.inventoryItem.parentItemId)
        ? i.inventoryItem.parentItemId
        : undefined,
  }));
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
        borrowerName: borrowerName || undefined,
        borrowerStreet: borrowerStreet || undefined,
        borrowerCity: borrowerCity || undefined,
        borrowerEmail: borrowerEmail || undefined,
        borrowerPhone: borrowerPhone || undefined,
        checkoutDate: checkoutDate || undefined,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        items: items.map((i) => ({ inventoryItemId: i.inventoryItemId })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loans'] });
      toast.push('Ausleihe wurde aktualisiert.');
      onSaved();
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  // Inventory items with accessories are automatically loaned out together -
  // fetch the picked item's accessories and add a row per accessory, tagged
  // so they're shown/removed as a unit with their main object.
  const addAccessoryRows = async (parentItemId: string) => {
    try {
      const detail = (await api.get<InventoryItemDetail>(`/inventory/${parentItemId}`)).data;
      if (detail.accessories.length === 0) return;
      setItems((prev) => {
        const existingIds = new Set(prev.map((r) => r.inventoryItemId));
        const accessoryRows: EditableItem[] = detail.accessories
          .filter((a) => !existingIds.has(a.id))
          .map((a) => ({
            inventoryItemId: a.id,
            label: a.inventoryNumber ? `${a.inventoryNumber} — ${a.article.name}` : a.article.name,
            accessoryOfItemId: parentItemId,
          }));
        return accessoryRows.length > 0 ? [...prev, ...accessoryRows] : prev;
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
        if (it.accessoryOfItemId === removed.inventoryItemId) return false;
        return true;
      });
    });
  };

  return (
    <Modal open onClose={onClose} title={`Bearbeiten – ${loan.borrowerName ?? 'Ausleihe'}`} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
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
              <div key={item.inventoryItemId} className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 truncate rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink">
                  <span className="truncate">{item.label}</span>
                  {item.accessoryOfItemId && (
                    <Badge tone="blue" className="shrink-0">
                      Zubehör
                    </Badge>
                  )}
                </div>
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
              allowArticles={false}
              onSelectItem={(inventoryItem) => {
                if (items.some((i) => i.inventoryItemId === inventoryItem.id)) return;
                setItems((prev) => [
                  ...prev,
                  {
                    inventoryItemId: inventoryItem.id,
                    label: inventoryItem.inventoryNumber
                      ? `${inventoryItem.inventoryNumber} — ${inventoryItem.article.name}`
                      : inventoryItem.article.name,
                  },
                ]);
                void addAccessoryRows(inventoryItem.id);
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
