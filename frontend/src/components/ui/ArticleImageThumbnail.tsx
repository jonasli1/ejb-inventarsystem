import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { Attachment } from '@/lib/api-types';
import { AttachmentThumbnail } from '@/components/ui/FileUploadList';

/** An article's product photo (category "image"), or a placeholder icon if none is set. */
export function ArticleImageThumbnail({
  articleId,
  size = 'h-10 w-10',
  enlargeable = true,
}: {
  articleId: string;
  size?: string;
  enlargeable?: boolean;
}) {
  const query = useQuery({
    queryKey: ['attachments', 'article', articleId, 'image'],
    queryFn: async () =>
      (
        await api.get<Attachment[]>('/attachments', {
          params: { entityType: 'article', entityId: articleId, category: 'image' },
        })
      ).data,
  });

  const image = query.data?.[0];
  if (!image) {
    return (
      <div
        className={`${size} flex shrink-0 items-center justify-center rounded-md border border-border bg-canvas text-muted`}
      >
        <Package size={16} />
      </div>
    );
  }
  return <AttachmentThumbnail attachment={image} enlargeable={enlargeable} size={size} />;
}
