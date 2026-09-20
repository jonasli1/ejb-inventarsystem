import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Loan } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileUploadList } from '@/components/ui/FileUploadList';
import { useToast } from '@/components/ui/toast';

export function LoanIssueModal({
  loan,
  onClose,
  onIssued,
}: {
  loan: Loan;
  onClose: () => void;
  onIssued: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: async () => api.post(`/loans/${loan.id}/issue`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loans', loan.id] });
      toast.push('Ausleihe wurde ausgegeben.');
      onIssued();
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open onClose={onClose} title={`Ausgabe – ${loan.subject}`} size="lg">
      <div className="flex flex-col gap-3">
        {loan.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-ink">
              {item.inventoryItem.article.name}{' '}
              {item.inventoryItem.inventoryNumber && (
                <span className="font-mono text-xs text-muted">({item.inventoryItem.inventoryNumber})</span>
              )}
            </p>
            <div className="mt-2">
              <FileUploadList
                entityType="loanItem"
                entityId={item.id}
                category="checkoutPhoto"
                canManage
                title="Zustandsfotos"
                accept="image/*"
              />
            </div>
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Ausgabe bestätigen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
