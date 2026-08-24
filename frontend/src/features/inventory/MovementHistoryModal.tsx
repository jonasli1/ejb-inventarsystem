import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api-client';
import type { Attachment, InventoryItem, StockMovement } from '@/lib/api-types';
import { INVENTORY_STATUS_LABEL, MOVEMENT_TYPE_LABEL } from '@/lib/status-labels';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { AttachmentThumbnail } from '@/components/ui/FileUploadList';

function MovementPhotos({ loanItemId, isCheckout }: { loanItemId: string; isCheckout: boolean }) {
  const category = isCheckout ? 'checkoutPhoto' : 'returnPhoto';
  const query = useQuery({
    queryKey: ['attachments', 'loanItem', loanItemId, category],
    queryFn: async () =>
      (
        await api.get<Attachment[]>('/attachments', {
          params: { entityType: 'loanItem', entityId: loanItemId, category },
        })
      ).data,
  });

  if (!query.data || query.data.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {query.data.map((att) => (
        <AttachmentThumbnail key={att.id} attachment={att} size="h-9 w-9" />
      ))}
    </div>
  );
}

export function MovementHistoryModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const navigate = useNavigate();
  const movementsQuery = useQuery({
    queryKey: ['inventory', item.id, 'movements'],
    queryFn: async () => (await api.get<StockMovement[]>(`/inventory/${item.id}/movements`)).data,
  });

  return (
    <Modal open onClose={onClose} title={`Bewegungshistorie – ${item.inventoryNumber}`} size="lg">
      {movementsQuery.isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
      {movementsQuery.data && movementsQuery.data.length === 0 && (
        <p className="text-sm text-muted">Keine Bewegungen vorhanden.</p>
      )}
      <ul className="flex flex-col gap-2">
        {movementsQuery.data?.map((m) => (
          <li key={m.id} className="rounded-lg bg-canvas px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-ink">{MOVEMENT_TYPE_LABEL[m.type] ?? m.type}</span>
              <span className="text-xs text-muted">{format(new Date(m.createdAt), 'dd.MM.yyyy HH:mm')}</span>
            </div>
            <p className="text-xs text-muted">
              {m.oldStatus &&
                m.newStatus &&
                `${INVENTORY_STATUS_LABEL[m.oldStatus] ?? m.oldStatus} → ${INVENTORY_STATUS_LABEL[m.newStatus] ?? m.newStatus}`}
              {m.fromRoom && m.toRoom && `${m.fromRoom.name} → ${m.toRoom.name}`}
              {m.oldCondition != null && m.newCondition != null && `${m.oldCondition}% → ${m.newCondition}%`}
              {m.note && ` · ${m.note}`}
              {m.user && ` · ${m.user.displayName}`}
            </p>
            {m.loanItem && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/loans?loanId=${m.loanItem!.loanId}`);
                  }}
                  className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  Zur Ausleihe
                  <ArrowUpRight size={12} />
                </button>
                <MovementPhotos loanItemId={m.loanItem.id} isCheckout={m.newStatus === 'borrowed'} />
              </>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
