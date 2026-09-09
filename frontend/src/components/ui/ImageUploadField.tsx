import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Trash2, Upload, ZoomIn } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useAttachmentBlobUrl } from '@/lib/useAttachmentBlobUrl';
import type { Attachment, AttachmentEntityType } from '@/lib/api-types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';
import { useLightbox } from '@/components/ui/ImageLightbox';

export function ImageUploadField({
  entityType,
  entityId,
  canManage,
  label = 'Produktfoto',
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  canManage: boolean;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lightbox = useLightbox();

  const queryKey = ['attachments', entityType, entityId, 'image'];

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (
        await api.get<Attachment[]>('/attachments', {
          params: { entityType, entityId, category: 'image' },
        })
      ).data,
  });
  const image = query.data?.[0] ?? null;
  const { url: objectUrl } = useAttachmentBlobUrl(image?.thumbnailUrl, !!image);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'image');
      await api.post(`/attachments/${entityType}/${entityId}`, formData);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!image}
          onClick={() => image && lightbox.open(`/attachments/${image.id}/download`, label)}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-canvas disabled:cursor-default"
        >
          {objectUrl ? (
            <>
              <img src={objectUrl} alt={label} className="h-full w-full object-cover" />
              <span className="absolute inset-0 hidden items-center justify-center bg-black/30 group-hover:flex">
                <ZoomIn size={18} className="text-white" />
              </span>
            </>
          ) : (
            <ImageOff size={22} className="text-muted" />
          )}
        </button>
        {canManage && (
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={uploadMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              {image ? 'Ersetzen' : 'Hochladen'}
            </Button>
            {image && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => deleteMutation.mutate(image.id)}
              >
                <Trash2 size={14} />
                Entfernen
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
