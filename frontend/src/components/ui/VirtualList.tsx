import { useEffect, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Spinner } from './Spinner';

/**
 * Windowed list for datasets too large to render in full (only the rows
 * actually scrolled into view are mounted), paired with infinite-scroll
 * loading via onEndReached - used for the flat inventory list and the
 * activity feed, both backed by keyset/cursor-paginated endpoints with no
 * cheap total count.
 */
export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  onEndReached,
  hasMore,
  isFetchingMore,
  className,
}: {
  items: T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => ReactNode;
  onEndReached?: () => void;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  className?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index;

  useEffect(() => {
    if (lastIndex === undefined || !hasMore || isFetchingMore) return;
    if (lastIndex >= items.length - 8) onEndReached?.();
  }, [lastIndex, hasMore, isFetchingMore, items.length, onEndReached]);

  return (
    <div ref={parentRef} className={className} style={{ overflowY: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
      {isFetchingMore && (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      )}
    </div>
  );
}
