import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { InventoryItem, Loan } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ItemSearchSelect } from '@/components/ui/ItemSearchSelect';
import { useToast } from '@/components/ui/toast';

interface EditableItem {
  inventoryItemId: string;
  label: string;
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
  const [items, setItems] = useState<EditableItem[]>(
    loan.items.map((i) => ({
      inventoryItemId: i.inventoryItemId,
      label: `${i.inventoryItem.inventoryNumber} — ${i.inventoryItem.article.name}`,
    })),
  );
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
      >
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Änderungen an Adresse, Kontakt oder Objekten erfordern keine erneute Genehmigung.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ausleiher (Name)">
            <Input value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} />
          </Field>
          <Field label="Geplantes Ausgabedatum">
            <Input type="date" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} required />
          </Field>
          <Field label="Rückgabe fällig am (optional)">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Straße, Hausnummer (optional)">
            <Input value={borrowerStreet} onChange={(e) => setBorrowerStreet(e.target.value)} />
          </Field>
          <Field label="PLZ, Ort (optional)">
            <Input value={borrowerCity} onChange={(e) => setBorrowerCity(e.target.value)} />
          </Field>
          <Field label="E-Mail (optional)">
            <Input type="email" value={borrowerEmail} onChange={(e) => setBorrowerEmail(e.target.value)} />
          </Field>
          <Field label="Handynummer (optional)">
            <Input value={borrowerPhone} onChange={(e) => setBorrowerPhone(e.target.value)} />
          </Field>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Objekte</label>
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div key={item.inventoryItemId} className="flex items-center gap-2">
                <div className="flex-1 truncate rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink">
                  {item.label}
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="p-1.5 text-muted hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <ItemSearchSelect
              selectedLabel=""
              allowArticles={false}
              onSelectItem={(inventoryItem: InventoryItem) => {
                if (items.some((i) => i.inventoryItemId === inventoryItem.id)) return;
                setItems((prev) => [
                  ...prev,
                  {
                    inventoryItemId: inventoryItem.id,
                    label: `${inventoryItem.inventoryNumber} — ${inventoryItem.article.name}`,
                  },
                ]);
              }}
              onClear={() => undefined}
              placeholder="Objekt hinzufügen …"
            />
          </div>
        </div>

        <Field label="Notizen (optional)">
          <textarea
            className="w-full rounded-lg border border-border bg-white p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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
