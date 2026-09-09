import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

/**
 * Fetches an authenticated attachment endpoint (thumbnail/medium/download) as
 * a Blob via React Query - cached and keyed by URL, safe to cache
 * indefinitely since a given variant's bytes never change once generated -
 * then exposes it as a local object URL for <img src>. The object URL itself
 * is created/revoked in a local effect so its lifetime isn't tied to the
 * query cache (which may outlive the component).
 */
export function useAttachmentBlobUrl(url: string | null | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ['attachment-blob', url],
    queryFn: async () => (await api.get<Blob>(url as string, { responseType: 'blob' })).data,
    enabled: enabled && !!url,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) {
      setObjectUrl(null);
      return;
    }
    const created = URL.createObjectURL(query.data);
    setObjectUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [query.data]);

  return {
    url: objectUrl,
    isLoading: enabled && !!url && !objectUrl && !query.isError,
    isError: query.isError,
  };
}
