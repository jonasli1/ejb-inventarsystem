import type { InventoryItem } from '@/lib/api-types';
import { InventoryStatusBadge } from '@/components/ui/Badge';
import { ArticleImageThumbnail } from '@/components/ui/ArticleImageThumbnail';

/**
 * One inventory item as a row - a table-like row on larger screens, a
 * stacked card on small ones. Used by both the (virtualized) flat list and
 * the grouped-by-article nested list, so the responsive behavior is
 * consistent everywhere inventory items are listed.
 */
export function InventoryItemRow({
  item,
  onSelect,
  nested,
}: {
  item: InventoryItem;
  onSelect: (item: InventoryItem) => void;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`flex w-full items-center gap-3 border-b border-border py-2.5 pr-5 text-left hover:bg-canvas ${
        nested ? 'bg-canvas/40 pl-12' : 'pl-5'
      }`}
    >
      <ArticleImageThumbnail articleId={item.articleId} size="h-9 w-9 sm:h-8 sm:w-8" />

      {/* Desktop: table-like columns */}
      <div className="hidden flex-1 items-center gap-3 sm:flex">
        <span className="w-28 shrink-0 truncate font-mono text-xs text-ink">{item.inventoryNumber ?? '–'}</span>
        <span className="w-48 shrink-0 truncate text-ink">{item.article.name}</span>
        <span className="w-32 shrink-0">
          <InventoryStatusBadge status={item.status} />
        </span>
        <span className="flex-1 truncate text-muted">
          {item.location.name} / {item.room.name}
        </span>
        <span className="w-40 shrink-0 truncate text-muted">{item.ownerOrganization.name}</span>
      </div>

      {/* Mobile: stacked card */}
      <div className="min-w-0 flex-1 sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-ink">{item.article.name}</span>
          <InventoryStatusBadge status={item.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {item.inventoryNumber && <span className="font-mono">{item.inventoryNumber}</span>}
          {item.inventoryNumber && ' · '}
          {item.location.name} / {item.room.name}
        </p>
        <p className="truncate text-xs text-muted">{item.ownerOrganization.name}</p>
      </div>
    </button>
  );
}
