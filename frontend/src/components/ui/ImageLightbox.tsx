import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface LightboxImage {
  url: string;
  alt?: string;
}

interface LightboxContextValue {
  open: (url: string, alt?: string) => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

/** Mount once near the app root. Any descendant can open a full-screen image via useLightbox(). */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const [image, setImage] = useState<LightboxImage | null>(null);

  useEffect(() => {
    if (!image) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImage(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [image]);

  return (
    <LightboxContext.Provider value={{ open: (url, alt) => setImage({ url, alt }) }}>
      {children}
      {image &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setImage(null)}
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={() => setImage(null)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Schließen"
            >
              <X size={22} />
            </button>
            <img
              src={image.url}
              alt={image.alt ?? ''}
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
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
