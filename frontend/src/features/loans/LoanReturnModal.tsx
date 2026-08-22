import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { InventoryStatus, Loan } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FileUploadList } from '@/components/ui/FileUploadList';
import { useToast } from '@/components/ui/toast';

const STATUS_OPTIONS: InventoryStatus[] = ['available', 'maintenance', 'defect'];

interface RowState {
  checked: boolean;
  newStatus: InventoryStatus;
  returnedCondition: string;
}

export function LoanReturnModal({
  loan,
  onClose,
  onReturned,
}: {
  loan: Loan;
  onClose: () => void;
  onReturned?: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const openItems = loan.items.filter((i) => !i.returnedAt);

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      openItems.map((i) => [
        i.id,
        { checked: true, newStatus: 'available' as InventoryStatus, returnedCondition: '' },
      ]),
    ),
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const items = Object.entries(rows)
        .filter(([, r]) => r.checked)
        .map(([loanItemId, r]) => ({
          loanItemId,
          newStatus: r.newStatus,
          returnedCondition: r.returnedCondition ? Number(r.returnedCondition) : undefined,
        }));
      return api.post(`/loans/${loan.id}/return`, { items });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loans'] });
      void queryClient.invalidateQueries({ queryKey: ['loans', loan.id] });
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.push('Rückgabe wurde erfasst.');
      onReturned?.();
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open onClose={onClose} title={`Rückgabe – ${loan.borrowerName ?? 'Ausleihe'}`} size="lg">
      <div className="flex flex-col gap-3">
        {openItems.length === 0 && <p className="text-sm text-muted">Alle Objekte wurden bereits zurückgegeben.</p>}
        {openItems.map((item) => {
          const isConsumable = item.inventoryItem.article.type === 'CONSUMABLE';
          const row = rows[item.id];
          return (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={(e) =>
                    setRows((prev) => ({ ...prev, [item.id]: { ...prev[item.id], checked: e.target.checked } }))
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">
                    {item.inventoryItem.article.name}{' '}
                    <span className="font-mono text-xs text-muted">({item.inventoryItem.inventoryNumber})</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <div className="w-44">
                      <label className="mb-1 block text-xs text-muted">Neuer Status</label>
                      <Select
                        value={row.newStatus}
                        onChange={(e) =>
                          setRows((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], newStatus: e.target.value as InventoryStatus },
                          }))
                        }
                        disabled={!row.checked}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {isConsumable && (
                      <div className="w-32">
                        <label className="mb-1 block text-xs text-muted">Füllstand %</label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={row.returnedCondition}
                          onChange={(e) =>
                            setRows((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], returnedCondition: e.target.value },
                            }))
                          }
                          disabled={!row.checked}
                        />
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <FileUploadList
                      entityType="loanItem"
                      entityId={item.id}
                      category="returnPhoto"
                      canManage
                      title="Zustandsfotos"
                      accept="image/*"
                    />
                  </div>
                </div>
              </label>
            </div>
          );
        })}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            type="button"
            loading={mutation.isPending}
            disabled={openItems.length === 0 || !Object.values(rows).some((r) => r.checked)}
            onClick={() => mutation.mutate()}
          >
            Rückgabe bestätigen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
