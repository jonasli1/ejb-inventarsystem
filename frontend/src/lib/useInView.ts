import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * True once the referenced element has scrolled within `rootMargin` of the
 * viewport at least once (and stays true afterwards - used to lazy-load an
 * image the first time it's about to become visible, e.g. in a long list).
 */
export function useInView<T extends Element>(rootMargin = '200px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
