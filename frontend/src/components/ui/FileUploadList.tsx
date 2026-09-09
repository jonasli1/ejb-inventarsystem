import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, FileText, ImageOff, Trash2, Upload } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { downloadExport } from '@/lib/export';
import { useAttachmentBlobUrl } from '@/lib/useAttachmentBlobUrl';
import { useInView } from '@/lib/useInView';
import type { Attachment, AttachmentCategory, AttachmentEntityType } from '@/lib/api-types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { useLightbox } from '@/components/ui/ImageLightbox';

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Small inline preview for image attachments; other categories fall back to a
 * file icon. Only the small thumbnail variant is fetched here, lazily once
 * scrolled into view - the full-resolution original is fetched separately by
 * the lightbox, only once the user actually clicks to enlarge (set
 * enlargeable={false} to opt out, e.g. inside another already-clickable row).
 */
export function AttachmentThumbnail({
  attachment,
  enlargeable = true,
  size = 'h-10 w-10',
}: {
  attachment: Attachment;
  enlargeable?: boolean;
  size?: string;
}) {
  const isImage = attachment.mimeType.startsWith('image/');
  const [ref, inView] = useInView<HTMLDivElement>();
  // attachment.thumbnailUrl is an app-root-relative URL (already includes the
  // API prefix, e.g. "/api/v1/attachments/:id/thumbnail") meant for direct
  // browser navigation - the axios client's baseURL would double that prefix
  // if used as-is, so the path is built relative to baseURL here instead,
  // matching every other attachment endpoint call in the app.
  const { url, isError } = useAttachmentBlobUrl(
    isImage ? `/attachments/${attachment.id}/thumbnail` : null,
    isImage && inView,
  );
  const lightbox = useLightbox();

  if (!isImage) {
    return <FileText size={16} className="shrink-0 text-muted" />;
  }
  return (
    <div ref={ref} className={`${size} shrink-0 overflow-hidden rounded-md border border-border bg-canvas`}>
      {url ? (
        <img
          src={url}
          alt={attachment.fileName}
          loading="lazy"
          className={`h-full w-full object-cover ${enlargeable ? 'cursor-pointer' : ''}`}
          onClick={
            enlargeable
              ? (e) => {
                  e.stopPropagation();
                  lightbox.open(`/attachments/${attachment.id}/download`, attachment.fileName);
                }
              : undefined
          }
        />
      ) : isError ? (
        <div className="flex h-full w-full items-center justify-center" title="Datei nicht verfügbar">
          <ImageOff size={14} className="text-muted" />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {inView && <Spinner />}
        </div>
      )}
    </div>
  );
}

export function FileUploadList({
  entityType,
  entityId,
  category,
  canManage,
  title,
  accept,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  category: AttachmentCategory;
  canManage: boolean;
  title: string;
  accept?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const queryKey = ['attachments', entityType, entityId, category];

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (
        await api.get<Attachment[]>('/attachments', {
          params: { entityType, entityId, category },
        })
      ).data,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      await api.post(`/attachments/${entityType}/${entityId}`, formData);
    },
    onMutate: () => setUploading(true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.push('Datei wurde hochgeladen.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.push('Datei wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-ink">{title}</label>
        {canManage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              Hochladen
            </Button>
          </>
        )}
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : !query.data || query.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
          Keine Dateien vorhanden.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {query.data.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
            >
              <AttachmentThumbnail attachment={att} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">{att.fileName}</p>
                <p className="text-xs text-muted">
                  {humanFileSize(att.sizeBytes)} · {att.uploadedBy?.displayName ?? '–'} ·{' '}
                  {format(new Date(att.createdAt), 'dd.MM.yyyy HH:mm')}
                </p>
              </div>
              <button
                type="button"
                title="Herunterladen"
                className="shrink-0 p-1 text-muted hover:text-brand-600"
                onClick={() => downloadExport(`/attachments/${att.id}/download`, {}, att.fileName)}
              >
                <Download size={15} />
              </button>
              {canManage && (
                <button
                  type="button"
                  title="Löschen"
                  className="shrink-0 p-1 text-muted hover:text-red-600"
                  onClick={() => {
                    if (window.confirm(`"${att.fileName}" wirklich löschen?`)) {
                      deleteMutation.mutate(att.id);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
