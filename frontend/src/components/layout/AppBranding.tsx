import { useEffect } from 'react';
import { usePublicAppSettings } from '@/lib/app-settings';

/** Renders nothing - applies the configured name/logo to the tab title and favicon. */
export function AppBranding() {
  const { data } = usePublicAppSettings();

  useEffect(() => {
    if (!data) return;
    document.title = data.displayName;

    if (data.logoDataUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = data.logoDataUrl;
    }
  }, [data]);

  return null;
}
