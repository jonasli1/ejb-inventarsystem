import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowRightLeft, Download, History, PackageX, ShieldAlert, Trash2, X } from 'lucide-react';
import { api, getApiErrorCode, getApiErrorMessage } from '@/lib/api-client';
import { useLocations, useOrganizationUnits, useOrganizations, useRooms } from '@/lib/reference-data';
import type { AccessoryCandidate, InventoryItem, InventoryItemDetail, InventoryStatus } from '@/lib/api-types';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { DateInput } from '@/components/ui/DateInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge, InventoryStatusBadge } from '@/components/ui/Badge';
import { INVENTORY_STATUS_LABEL, MANUALLY_ASSIGNABLE_INVENTORY_STATUSES } from '@/lib/status-labels';
import { useToast } from '@/components/ui/toast';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { AttachmentThumbnail, FileUploadList } from '@/components/ui/FileUploadList';
import { ArticleImageThumbnail } from '@/components/ui/ArticleImageThumbnail';
import { AccessorySearchSelect } from '@/components/ui/AccessorySearchSelect';
import { Spinner } from '@/components/ui/Spinner';
import { downloadExport } from '@/lib/export';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { MovementHistoryModal } from './MovementHistoryModal';

interface EditForm {
  inventoryNumber: string;
  status: InventoryStatus;
  serialNumber: string;
  purchasePrice: string;
  purchaseDate: string;
  nextDguvV3Check: string;
  notes: string;
  ownerOrganizationId: string;
  ownerUnitId: string;
}

function toDateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function formToDefaults(item: InventoryItem): EditForm {
  return {
    inventoryNumber: item.inventoryNumber ?? '',
    status: item.status,
    serialNumber: item.serialNumber ?? '',
    purchasePrice: item.purchasePrice ?? '',
    purchaseDate: toDateInputValue(item.purchaseDate),
    nextDguvV3Check: toDateInputValue(item.nextDguvV3Check),
    notes: item.notes ?? '',
    ownerOrganizationId: item.ownerOrganizationId,
    ownerUnitId: item.ownerUnitId,
  };
}

type Tab = 'overview' | 'documents' | 'accessories';

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
  const canUpdate = hasPermission(PERMISSIONS.INVENTORY_UPDATE);
  const canRetire = hasPermission(PERMISSIONS.INVENTORY_RETIRE);
  const canDelete = hasPermission(PERMISSIONS.INVENTORY_DELETE);
  const canChangeInvNum = hasPermission(PERMISSIONS.INVENTORY_CHANGE_INVENTORY_NUMBER);
  const canExport = hasPermission(PERMISSIONS.REPORTS_VIEW);
  const isBorrowed = item.status === 'borrowed';
  const [tab, setTab] = useState<Tab>('overview');
  const [moveOpen, setMoveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['inventory', item.id, 'detail'],
    queryFn: async () => (await api.get<InventoryItemDetail>(`/inventory/${item.id}`)).data,
  });
  const detail = detailQuery.data;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<EditForm>({ defaultValues: formToDefaults(item) });
  const ownerOrganizationId = watch('ownerOrganizationId');
  const { data: organizations } = useOrganizations();
  const { data: units } = useOrganizationUnits(ownerOrganizationId);

  useEffect(() => {
    reset(formToDefaults(item));
  }, [item, reset]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', item.id] });
    void queryClient.invalidateQueries({ queryKey: ['articles'] });
  };

  const updateMutation = useMutation({
    mutationFn: async (values: EditForm) =>
      api.put(`/inventory/${item.id}`, {
        // Each field group is only sent when the actor actually holds the
        // permission for it - the backend enforces this independently, but
        // omitting the field here keeps a change-inv-num-only submission
        // from also (harmlessly, but confusingly) re-sending unchanged
        // manage-gated fields the actor isn't allowed to touch.
        ...(canUpdate
          ? {
              // Status is managed by the loan workflow while the item is
              // checked out; don't touch it from this form in that case.
              status: isBorrowed ? undefined : values.status,
              serialNumber: values.serialNumber || undefined,
              notes: values.notes || undefined,
              ownerOrganizationId: values.ownerOrganizationId,
              ownerUnitId: values.ownerUnitId,
              // `null` (not `undefined`) once emptied: this form always
              // resends the full current field set on submit, so an emptied
              // price/date must reach the backend as an explicit clear -
              // `undefined` would instead be dropped from the request body
              // and leave the old value in place (the backend treats "field
              // omitted" and "field explicitly cleared" differently, see
              // inventory.service.ts).
              purchasePrice: values.purchasePrice ? Number(values.purchasePrice) : null,
              purchaseDate: values.purchaseDate || null,
              nextDguvV3Check: values.nextDguvV3Check || null,
            }
          : {}),
        ...(canChangeInvNum ? { inventoryNumber: values.inventoryNumber || undefined } : {}),
      }),
    onSuccess: () => {
      invalidate();
      toast.push('Änderungen gespeichert.');
      onClose();
    },
    onError: (err) => {
      if (getApiErrorCode(err) === 'DUPLICATE_INVENTORY_NUMBER') {
        setError('inventoryNumber', { type: 'server', message: getApiErrorMessage(err) });
      }
      toast.push(getApiErrorMessage(err), 'error');
    },
  });

  const retireMutation = useMutation({
    mutationFn: async () => api.put(`/inventory/${item.id}`, { status: 'retired' }),
    onSuccess: () => {
      invalidate();
      toast.push('Objekt wurde ausgemustert.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/inventory/${item.id}`),
    onSuccess: () => {
      invalidate();
      toast.push('Inventarobjekt wurde endgültig gelöscht.');
      onClose();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const removeAccessoryMutation = useMutation({
    mutationFn: async (accessoryId: string) =>
      api.delete(`/inventory/${item.id}/accessory/${accessoryId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', item.id, 'detail'] });
      toast.push('Zubehör wurde entfernt.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const addAccessoryMutation = useMutation({
    mutationFn: async (candidate: AccessoryCandidate) =>
      api.put(`/inventory/${item.id}/accessory`, { accessoryItemId: candidate.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', item.id, 'detail'] });
      toast.push('Zubehör wurde zugeordnet.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const statusOptions = MANUALLY_ASSIGNABLE_INVENTORY_STATUSES.filter((s) => s !== 'retired' || canRetire);

  return (
    <>
      <Modal open onClose={onClose} title={item.inventoryNumber ?? item.article.name} size="lg">
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
                    `${item.inventoryNumber ?? item.article.name}.${fmt}`,
                  )
                }
              />
            )}
            <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
              <History size={14} />
              Bewegungshistorie
            </Button>
            {canUpdate && (
              <Button variant="secondary" size="sm" onClick={() => setMoveOpen(true)}>
                <ArrowRightLeft size={14} />
                Verschieben
              </Button>
            )}
          </div>
        </div>

        {item.status === 'maintenance' && canRetire && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-500/10">
            <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <ShieldAlert size={16} className="shrink-0" />
              Dieses Objekt befindet sich in Wartung.
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={retireMutation.isPending}
              onClick={() => {
                if (window.confirm('Objekt direkt ausmustern? Der Status wird auf "Ausgemustert" gesetzt.')) {
                  retireMutation.mutate();
                }
              }}
            >
              <PackageX size={14} />
              Direkt ausmustern
            </Button>
          </div>
        )}

        <div className="mb-4 flex gap-1 border-b border-border">
          {(
            [
              ['overview', 'Übersicht'],
              ['documents', 'Dokumente'],
              ['accessories', 'Zubehör'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={clsx(
                'border-b-2 px-3 py-2 text-sm font-medium',
                tab === value ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {label}
              {value === 'accessories' && detail && detail.accessories.length > 0 && (
                <span className="ml-1.5 text-xs text-muted">({detail.accessories.length})</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="flex flex-col gap-4">
            {detail?.article.notes && (
              <div className="rounded-lg border border-border bg-canvas px-3 py-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
                  Notizen vom Artikel
                  <Badge tone="blue">vom Artikel</Badge>
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink">{detail.article.notes}</p>
              </div>
            )}

            <form
              onSubmit={handleSubmit((values) => updateMutation.mutate(values))}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label="Inventarnummer (optional)" error={errors.inventoryNumber?.message}>
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
                  <Select {...register('status')} disabled={!canUpdate}>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {INVENTORY_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Seriennummer">
                <Input {...register('serialNumber')} disabled={!canUpdate} />
              </Field>
              <Field label="Eigentümer-Organisation">
                <Select {...register('ownerOrganizationId')} disabled={!canUpdate}>
                  {organizations?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Eigentümer-Untereinheit">
                <Select {...register('ownerUnitId')} disabled={!canUpdate}>
                  {units?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Anschaffungspreis €">
                <Input type="number" min={0} step="0.01" {...register('purchasePrice')} disabled={!canUpdate} />
              </Field>
              <Field label="Anschaffungsdatum">
                <DateInput {...register('purchaseDate')} disabled={!canUpdate} />
              </Field>
              <Field label="Nächste DGUV-V3-Prüfung">
                <DateInput {...register('nextDguvV3Check')} disabled={!canUpdate} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notizen">
                  <textarea
                    className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-canvas"
                    rows={2}
                    disabled={!canUpdate}
                    {...register('notes')}
                  />
                </Field>
              </div>

              {(canUpdate || canChangeInvNum || canDelete) && (
                <div className="flex justify-between gap-2 sm:col-span-2">
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Objekt "${item.inventoryNumber ?? item.article.name}" endgültig löschen? Es verschwindet dauerhaft aus allen Ansichten und dies kann nicht rückgängig gemacht werden.`,
                          )
                        ) {
                          deleteMutation.mutate();
                        }
                      }}
                      loading={deleteMutation.isPending}
                    >
                      <Trash2 size={14} />
                      Endgültig löschen
                    </Button>
                  ) : (
                    <span />
                  )}
                  {(canUpdate || canChangeInvNum) && (
                    <Button type="submit" loading={updateMutation.isPending}>
                      Speichern
                    </Button>
                  )}
                </div>
              )}
            </form>
          </div>
        )}

        {tab === 'documents' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FileUploadList
                entityType="inventoryItem"
                entityId={item.id}
                category="document"
                canManage={canUpdate}
                title="Dokumente (z. B. Anleitungen)"
              />
              <FileUploadList
                entityType="inventoryItem"
                entityId={item.id}
                category="inspection"
                canManage={canUpdate}
                title="Prüfdokumente (z. B. E-Check)"
              />
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                Dokumente vom Artikel
                <Badge tone="blue">vom Artikel</Badge>
              </p>
              {!detail ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : detail.article.documents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
                  Keine Dokumente am Artikel hinterlegt.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detail.article.documents.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
                    >
                      <AttachmentThumbnail attachment={att} />
                      <p className="min-w-0 flex-1 truncate text-ink">{att.fileName}</p>
                      <button
                        type="button"
                        title="Herunterladen"
                        className="-m-2 shrink-0 p-2 text-muted hover:text-brand-600"
                        onClick={() => downloadExport(`/attachments/${att.id}/download`, {}, att.fileName)}
                      >
                        <Download size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === 'accessories' && (
          <div className="flex flex-col gap-4">
            {canUpdate && (
              <AccessorySearchSelect itemId={item.id} onSelect={(c) => addAccessoryMutation.mutate(c)} />
            )}
            {!detail ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : detail.accessories.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
                Kein Zubehör zugeordnet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {detail.accessories.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
                  >
                    <ArticleImageThumbnail articleId={a.articleId} size="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink">
                        {a.article.name}{' '}
                        {a.inventoryNumber && <span className="font-mono text-xs text-muted">{a.inventoryNumber}</span>}
                      </p>
                      <InventoryStatusBadge status={a.status} />
                    </div>
                    {canUpdate && (
                      <button
                        type="button"
                        title="Zubehör entfernen"
                        className="-m-2 shrink-0 p-2 text-muted hover:text-red-600"
                        onClick={() => removeAccessoryMutation.mutate(a.id)}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
