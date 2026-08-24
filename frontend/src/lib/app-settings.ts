import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PublicAppSettingsConfig } from '@/lib/api-types';

/** Public (no auth needed) app name/logo/login-method availability - usable on the login page too. */
export function usePublicAppSettings() {
  return useQuery({
    queryKey: ['settings', 'general', 'public'],
    queryFn: async () => (await api.get<PublicAppSettingsConfig>('/settings/general')).data,
    staleTime: 60_000,
  });
}
