import { useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PackageCheck, Pencil, RotateCcw, Undo2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { Attachment, Loan } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { InventoryStatusBadge, LoanStatusBadge } from '@/components/ui/Badge';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { AttachmentThumbnail } from '@/components/ui/FileUploadList';
import { downloadExport } from '@/lib/export';
import { useAuth } from '@/auth/useAuth';
import { isPermitted, PERMISSIONS } from '@/lib/permissions';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/Button';
import { LoanIssueModal } from './LoanIssueModal';
import { LoanReturnModal } from './LoanReturnModal';
import { LoanEditModal } from './LoanEditModal';

function formatDate(value: string | null): string {
  return value ? format(new Date(value), 'dd.MM.yyyy') : '–';
}

function ItemPhotos({ loanItemId }: { loanItemId: string }) {
  const query = useQuery({
    queryKey: ['attachments', 'loanItem', loanItemId],
    queryFn: async () =>
      (await api.get<Attachment[]>('/attachments', { params: { entityType: 'loanItem', entityId: loanItemId } }))
        .data,
  });

  const photos = (query.data ?? []).filter(
    (a) => a.category === 'checkoutPhoto' || a.category === 'returnPhoto',
  );
  if (photos.length === 0) return <span className="text-xs text-muted">–</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((att) => (
        <AttachmentThumbnail key={att.id} attachment={att} size="h-8 w-8" />
      ))}
    </div>
  );
}

export function LoanDetailModal({
  loanId,
  initialLoan,
  onClose,
}: {
  loanId: string;
  initialLoan?: Loan;
  onClose: () => void;
}) {
  const { hasPermission, me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canApprove = isPermitted(hasPermission, [PERMISSIONS.LOANS_MANAGE, PERMISSIONS.LOANS_ADMINISTER]);
  const canIssueOrReturn = isPermitted(hasPermission, [PERMISSIONS.LOANS_SPEND, PERMISSIONS.LOANS_ADMINISTER]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const query = useQuery({
    queryKey: ['loans', loanId],
    queryFn: async () => (await api.get<Loan>(`/loans/${loanId}`)).data,
    initialData: initialLoan,
  });
  const loan = query.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['loans'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['articles'] });
  };

  const approveMutation = useMutation({
    mutationFn: async (itemIds?: string[]) =>
      api.post(`/loans/${loanId}/approve`, itemIds ? { itemIds } : undefined),
    onSuccess: (_, itemIds) => {
      invalidate();
      toast.push(itemIds ? 'Objekt wurde genehmigt.' : 'Alle Objekte wurden genehmigt.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => api.post(`/loans/${loanId}/reset-status`),
    onSuccess: () => {
      invalidate();
      toast.push('Status wurde auf "beantragt" zurückgesetzt.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  if (!loan) return null;

  const canEdit = loan.lentByUserId === me?.id || canApprove;
  const approvedCount = loan.items.filter((i) => i.approvedAt).length;

  return (
    <Modal open onClose={onClose} title={loan.borrowerName ?? 'Ausleihe'} size="lg">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {hasPermission(PERMISSIONS.REPORTS_VIEW) && (
              <ExportButtons
                onExport={(fmt) =>
                  downloadExport(`/export/loans/${loan.id}`, { format: fmt }, `Ausleihe.${fmt}`)
                }
              />
            )}
          </div>
          {(canApprove || canIssueOrReturn || canEdit) && (
            <div className="flex flex-wrap items-center gap-2">
              {canApprove && loan.status === 'requested' && (
                <Button
                  size="sm"
                  loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(undefined)}
                >
                  <CheckCircle2 size={14} />
                  Alle genehmigen ({approvedCount}/{loan.items.length})
                </Button>
              )}
              {canIssueOrReturn && loan.status === 'approved' && (
                <Button size="sm" onClick={() => setIssueOpen(true)}>
                  <PackageCheck size={14} />
                  Ausgeben
                </Button>
              )}
              {canIssueOrReturn && loan.status === 'issued' && (
                <Button size="sm" onClick={() => setReturnOpen(true)}>
                  <Undo2 size={14} />
                  Rückgabe erfassen
                </Button>
              )}
              {canEdit && loan.status !== 'completed' && (
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                  <Pencil size={14} />
                  Bearbeiten
                </Button>
              )}
              {canApprove && loan.status !== 'requested' && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={resetMutation.isPending}
                  onClick={() => {
                    if (window.confirm('Status wirklich auf "beantragt" zurücksetzen?')) {
                      resetMutation.mutate();
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  Status zurücksetzen
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted">Ausleiher</p>
            <p className="text-ink">{loan.borrowerName ?? loan.borrowerPersonId ?? '–'}</p>
          </div>
          <div>
            <p className="text-muted">Status</p>
            <LoanStatusBadge status={loan.status} />
          </div>
          <div>
            <p className="text-muted">Erfasst von</p>
            <p className="text-ink">{loan.lentBy?.displayName ?? '–'}</p>
          </div>
          <div>
            <p className="text-muted">Geplantes Datum</p>
            <p className="text-ink">{formatDate(loan.checkoutDate)}</p>
          </div>
          <div>
            <p className="text-muted">Fällig am</p>
            <p className="text-ink">{formatDate(loan.dueDate)}</p>
          </div>
          <div>
            <p className="text-muted">Tatsächlich ausgegeben am</p>
            <p className="text-ink">{formatDate(loan.issuedAt)}</p>
          </div>
          <div>
            <p className="text-muted">Zurückgegeben am</p>
            <p className="text-ink">{formatDate(loan.returnedAt)}</p>
          </div>
          <div>
            <p className="text-muted">Adresse</p>
            <p className="text-ink">
              {loan.borrowerStreet || loan.borrowerCity
                ? [loan.borrowerStreet, loan.borrowerCity].filter(Boolean).join(', ')
                : '–'}
            </p>
          </div>
          <div>
            <p className="text-muted">Kontakt</p>
            <p className="text-ink">
              {[loan.borrowerEmail, loan.borrowerPhone].filter(Boolean).join(' · ') || '–'}
            </p>
          </div>
          <div>
            <p className="text-muted">Ausleihe-ID</p>
            <p className="font-mono text-xs text-ink">{loan.id}</p>
          </div>
        </div>

        {loan.notes && (
          <div>
            <p className="mb-1 text-sm text-muted">Notizen</p>
            <p className="text-sm text-ink">{loan.notes}</p>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Objekte ({loan.items.length})</h3>
            {loan.status === 'requested' && (
              <span className="text-xs text-muted">{approvedCount}/{loan.items.length} genehmigt</span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-canvas text-left text-xs font-medium text-muted">
                  <th className="px-3 py-2">Inventarnummer</th>
                  <th className="px-3 py-2">Artikel</th>
                  <th className="px-3 py-2">Zustand bei Ausgabe</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Genehmigt</th>
                  <th className="px-3 py-2">Fotos</th>
                </tr>
              </thead>
              <tbody>
                {loan.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-ink">
                      {item.inventoryItem.inventoryNumber}
                    </td>
                    <td className="px-3 py-2 text-ink">{item.inventoryItem.article.name}</td>
                    <td className="px-3 py-2 text-muted">
                      {item.checkedOutCondition != null ? `${item.checkedOutCondition}%` : '–'}
                    </td>
                    <td className="px-3 py-2">
                      {item.returnedAt ? (
                        <InventoryStatusBadge status={item.inventoryItem.status} />
                      ) : (
                        <span className="text-xs text-muted">
                          {loan.status === 'issued' ? 'noch ausgeliehen' : 'noch nicht ausgegeben'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.approvedAt ? (
                        <span className="text-xs text-emerald-700" title={item.approvedBy?.displayName}>
                          Genehmigt{item.approvedBy ? ` (${item.approvedBy.displayName})` : ''}
                        </span>
                      ) : canApprove && loan.status === 'requested' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={approveMutation.isPending}
                          onClick={() => approveMutation.mutate([item.id])}
                        >
                          Genehmigen
                        </Button>
                      ) : (
                        <span className="text-xs text-muted">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ItemPhotos loanItemId={item.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {issueOpen && <LoanIssueModal loan={loan} onClose={() => setIssueOpen(false)} onIssued={invalidate} />}
      {returnOpen && <LoanReturnModal loan={loan} onClose={() => setReturnOpen(false)} onReturned={invalidate} />}
      {editOpen && <LoanEditModal loan={loan} onClose={() => setEditOpen(false)} onSaved={invalidate} />}
    </Modal>
  );
}
