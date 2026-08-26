import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, History, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useLocations, useOrganizationUnits, useOrganizations, useRooms } from '@/lib/reference-data';
import type { InventoryItem, InventoryStatus } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { InventoryStatusBadge } from '@/components/ui/Badge';
import { INVENTORY_STATUS_LABEL, MANUALLY_ASSIGNABLE_INVENTORY_STATUSES } from '@/lib/status-labels';
import { useToast } from '@/components/ui/toast';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { FileUploadList } from '@/components/ui/FileUploadList';
import { ArticleImageThumbnail } from '@/components/ui/ArticleImageThumbnail';
import { downloadExport } from '@/lib/export';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { MovementHistoryModal } from './MovementHistoryModal';

interface EditForm {
  inventoryNumber: string;
  status: InventoryStatus;
  serialNumber: string;
  conditionPercent: string;
  purchasePrice: string;
  purchaseDate: string;
  notes: string;
  ownerOrganizationId: string;
  ownerUnitId: string;
}

function toDateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function InventoryDetailModal({
  item,
  onClose,
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.INVENTORY_MANAGE);
  const canChangeInvNum = hasPermission(PERMISSIONS.INVENTORY_CHANGE_INV_NUM);
  const canExport = hasPermission(PERMISSIONS.REPORTS_VIEW);
  const isConsumable = item.article.type === 'CONSUMABLE';
  const isBorrowed = item.status === 'borrowed';
  const [moveOpen, setMoveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { register, handleSubmit, watch, reset } = useForm<EditForm>({
    defaultValues: {
      inventoryNumber: item.inventoryNumber,
      status: item.status,
      serialNumber: item.serialNumber ?? '',
      conditionPercent: item.conditionPercent?.toString() ?? '',
      purchasePrice: item.purchasePrice ?? '',
      purchaseDate: toDateInputValue(item.purchaseDate),
      notes: item.notes ?? '',
      ownerOrganizationId: item.ownerOrganizationId,
      ownerUnitId: item.ownerUnitId,
    },
  });
  const ownerOrganizationId = watch('ownerOrganizationId');
  const { data: organizations } = useOrganizations();
  const { data: units } = useOrganizationUnits(ownerOrganizationId);

  useEffect(() => {
    reset({
      inventoryNumber: item.inventoryNumber,
      status: item.status,
      serialNumber: item.serialNumber ?? '',
      conditionPercent: item.conditionPercent?.toString() ?? '',
      purchasePrice: item.purchasePrice ?? '',
      purchaseDate: toDateInputValue(item.purchaseDate),
      notes: item.notes ?? '',
      ownerOrganizationId: item.ownerOrganizationId,
      ownerUnitId: item.ownerUnitId,
    });
  }, [item, reset]);

  const updateMutation = useMutation({
    mutationFn: async (values: EditForm) =>
      api.put(`/inventory/${item.id}`, {
        // Each field group is only sent when the actor actually holds the
        // permission for it - the backend enforces this independently, but
        // omitting the field here keeps a change-inv-num-only submission
        // from also (harmlessly, but confusingly) re-sending unchanged
        // manage-gated fields the actor isn't allowed to touch.
        ...(canManage
          ? {
              // Status is managed by the loan workflow while the item is
              // checked out; don't touch it from this form in that case.
              status: isBorrowed ? undefined : values.status,
              serialNumber: values.serialNumber || undefined,
              notes: values.notes || undefined,
              ownerOrganizationId: values.ownerOrganizationId,
              ownerUnitId: values.ownerUnitId,
              conditionPercent:
                isConsumable && values.conditionPercent ? Number(values.conditionPercent) : undefined,
              purchasePrice: values.purchasePrice ? Number(values.purchasePrice) : undefined,
              purchaseDate: values.purchaseDate || undefined,
            }
          : {}),
        ...(canChangeInvNum ? { inventoryNumber: values.inventoryNumber || undefined } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory', item.id, 'movements'] });
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.push('Änderungen gespeichert.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/inventory/${item.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.push('Inventarobjekt wurde ausgemustert.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <>
      <Modal open onClose={onClose} title={item.inventoryNumber} size="lg">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ArticleImageThumbnail articleId={item.articleId} size="h-9 w-9" />
          <InventoryStatusBadge status={item.status} />
          <span className="text-sm text-muted">{item.article.name}</span>
          <span className="text-sm text-muted">·</span>
          <span className="text-sm text-muted">
            {item.location.name} / {item.room.name}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canExport && (
              <ExportButtons
                onExport={(fmt) =>
                  downloadExport(
                    `/export/inventory/${item.id}`,
                    { format: fmt },
                    `${item.inventoryNumber}.${fmt}`,
                  )
                }
              />
            )}
            <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
              <History size={14} />
              Bewegungshistorie
            </Button>
            {canManage && (
              <Button variant="secondary" size="sm" onClick={() => setMoveOpen(true)}>
                <ArrowRightLeft size={14} />
                Verschieben
              </Button>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSubmit((values) => updateMutation.mutate(values))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <Field label="Inventarnummer">
            <Input {...register('inventoryNumber')} disabled={!canChangeInvNum} />
          </Field>
          <Field label="Status">
            {isBorrowed ? (
              <>
                <Select disabled value="borrowed">
                  <option value="borrowed">{INVENTORY_STATUS_LABEL.borrowed}</option>
                </Select>
                <p className="mt-1 text-xs text-muted">
                  Der Status wird durch die Ausleihe verwaltet und kann erst nach der Rückgabe geändert werden.
                </p>
              </>
            ) : (
              <Select {...register('status')} disabled={!canManage}>
                {MANUALLY_ASSIGNABLE_INVENTORY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INVENTORY_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Seriennummer">
            <Input {...register('serialNumber')} disabled={!canManage} />
          </Field>
          <Field label="Eigentümer-Organisation">
            <Select {...register('ownerOrganizationId')} disabled={!canManage}>
              {organizations?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Eigentümer-Untereinheit">
            <Select {...register('ownerUnitId')} disabled={!canManage}>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          {isConsumable && (
            <Field label="Füllstand %">
              <Input type="number" min={1} max={100} {...register('conditionPercent')} disabled={!canManage} />
            </Field>
          )}
          <Field label="Anschaffungspreis €">
            <Input type="number" min={0} step="0.01" {...register('purchasePrice')} disabled={!canManage} />
          </Field>
          <Field label="Anschaffungsdatum">
            <Input type="date" {...register('purchaseDate')} disabled={!canManage} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notizen">
              <textarea
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-canvas"
                rows={2}
                disabled={!canManage}
                {...register('notes')}
              />
            </Field>
          </div>

          {(canManage || canChangeInvNum) && (
            <div className="flex justify-between gap-2 sm:col-span-2">
              {canManage ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => deleteMutation.mutate()}
                  loading={deleteMutation.isPending}
                >
                  <Trash2 size={14} />
                  Ausmustern
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" loading={updateMutation.isPending}>
                Speichern
              </Button>
            </div>
          )}
        </form>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <FileUploadList
            entityType="inventoryItem"
            entityId={item.id}
            category="document"
            canManage={canManage}
            title="Dokumente (z. B. Anleitungen)"
          />
          <FileUploadList
            entityType="inventoryItem"
            entityId={item.id}
            category="inspection"
            canManage={canManage}
            title="Prüfdokumente (z. B. E-Check)"
          />
        </div>
      </Modal>

      {moveOpen && <MoveModal item={item} onClose={() => setMoveOpen(false)} onDone={onClose} />}
      {historyOpen && <MovementHistoryModal item={item} onClose={() => setHistoryOpen(false)} />}
    </>
  );
}

function MoveModal({
  item,
  onClose,
  onDone,
}: {
  item: InventoryItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, watch } = useForm<{ locationId: string; toRoomId: string; note: string }>({
    defaultValues: { locationId: item.locationId, toRoomId: '', note: '' },
  });
  const locationId = watch('locationId');
  const { data: rooms } = useRooms(locationId);
  const { data: allLocations } = useLocations();

  const moveMutation = useMutation({
    mutationFn: async (values: { toRoomId: string; note: string }) =>
      api.post(`/inventory/${item.id}/move`, { toRoomId: values.toRoomId, note: values.note || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory', item.id, 'movements'] });
      toast.push('Objekt wurde verschoben.');
      onClose();
      onDone();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open onClose={onClose} title="Objekt verschieben" size="sm">
      <form
        onSubmit={handleSubmit((values) => moveMutation.mutate({ toRoomId: values.toRoomId, note: values.note }))}
        className="flex flex-col gap-4"
      >
        <Field label="Ziel-Standort">
          <Select {...register('locationId')}>
            {allLocations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ziel-Raum">
          <Select {...register('toRoomId')} defaultValue="">
            <option value="" disabled>
              Raum wählen …
            </option>
            {rooms
              ?.filter((r) => r.id !== item.roomId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Notiz (optional)">
          <Input {...register('note')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={moveMutation.isPending}>
            Verschieben
          </Button>
        </div>
      </form>
    </Modal>
  );
}
