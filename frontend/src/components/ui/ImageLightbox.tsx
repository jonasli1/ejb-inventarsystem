import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAttachmentBlobUrl } from '@/lib/useAttachmentBlobUrl';
import { Spinner } from './Spinner';

interface LightboxTarget {
  /** API path to fetch the full-resolution image from (only requested once the lightbox actually opens). */
  fetchUrl: string;
  alt?: string;
}

interface LightboxContextValue {
  open: (fetchUrl: string, alt?: string) => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

function LightboxImage({ fetchUrl, alt }: LightboxTarget) {
  const { url, isLoading } = useAttachmentBlobUrl(fetchUrl, true);
  if (isLoading || !url) {
    return (
      <div className="flex h-40 w-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt ?? ''}
      className="max-h-full max-w-full rounded-lg object-contain"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/**
 * Mount once near the app root. Any descendant can open a full-screen image
 * via useLightbox() - the full-resolution image is only fetched once the
 * lightbox actually opens, never eagerly alongside a thumbnail.
 */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<LightboxTarget | null>(null);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTarget(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [target]);

  return (
    <LightboxContext.Provider value={{ open: (fetchUrl, alt) => setTarget({ fetchUrl, alt }) }}>
      {children}
      {target &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setTarget(null)}
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={() => setTarget(null)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Schließen"
            >
              <X size={22} />
            </button>
            <LightboxImage fetchUrl={target.fetchUrl} alt={target.alt} />
          </div>,
          document.body,
        )}
    </LightboxContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLightbox(): LightboxContextValue {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('useLightbox must be used within a LightboxProvider');
  return ctx;
}
