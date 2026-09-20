import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { findMatchedAlias } from '@/lib/matched-alias';
import type { Article, CursorResult, InventoryItem, PaginatedResult } from '@/lib/api-types';
import { INVENTORY_STATUS_LABEL } from '@/lib/status-labels';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ArticleImageThumbnail } from '@/components/ui/ArticleImageThumbnail';

interface Row {
  kind: 'article' | 'item';
  key: string;
  article?: Article;
  item?: InventoryItem;
}

/**
 * Universal search-and-select field: matches inventory items by number,
 * serial number, article name/manufacturer, owner organization, or location,
 * and also surfaces matching non-UNIQUE articles for quantity-based picking.
 */
export function ItemSearchSelect({
  selectedLabel,
  onSelectItem,
  onSelectArticle,
  onClear,
  placeholder = 'Suche nach Name, Inventarnummer, Hersteller, Standort …',
  allowArticles = true,
}: {
  selectedLabel: string;
  onSelectItem: (item: InventoryItem) => void;
  onSelectArticle?: (article: Article) => void;
  onClear: () => void;
  placeholder?: string;
  allowArticles?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const debounced = useDebouncedValue(search, 250);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = useQuery({
    queryKey: ['inventory', 'universal-search', debounced],
    queryFn: async () =>
      (
        await api.get<CursorResult<InventoryItem>>('/inventory', {
          params: { search: debounced, limit: 8 },
        })
      ).data.data,
    enabled: debounced.trim().length >= 2,
  });

  // A live server-side search, not a client-side filter over some capped
  // cached page - with 100+ articles in a real catalog, an article far from
  // the top of the default (alphabetical) listing would otherwise never
  // surface here no matter what's typed, silently making "nach Menge" picking
  // impossible for it.
  const articleQuery = useQuery({
    queryKey: ['articles', 'universal-search', debounced],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Article>>('/articles', {
          params: { search: debounced, pageSize: 5 },
        })
      ).data.data,
    enabled: allowArticles && debounced.trim().length >= 2,
  });

  const rows: Row[] = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    if (needle.length < 2) return [];
    const articleRows: Row[] = allowArticles
      ? (articleQuery.data ?? [])
          .filter((a) => a.loanableByQuantity && a.stock.available > 0)
          .slice(0, 3)
          .map((a) => ({ kind: 'article', key: `article-${a.id}`, article: a }))
      : [];
    // Items that are themselves accessory of another object can't be loaned
    // individually - they're only ever added automatically alongside their
    // main object - unless explicitly flagged as separately loanable.
    const itemRows: Row[] = (query.data ?? [])
      .filter((i) => !i.parentItemId || i.separatelyLoanable)
      .map((i) => ({
        kind: 'item',
        key: `item-${i.id}`,
        item: i,
      }));
    return [...articleRows, ...itemRows];
  }, [allowArticles, articleQuery.data, debounced, query.data]);

  if (selectedLabel) {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm">
        <span className="flex-1 truncate text-ink">{selectedLabel}</span>
        <button type="button" onClick={onClear} className="text-xs text-brand-600 hover:underline">
          Ändern
        </button>
      </div>
    );
  }

  const select = (row: Row) => {
    if (row.kind === 'article' && row.article) onSelectArticle?.(row.article);
    if (row.kind === 'item' && row.item) onSelectItem(row.item);
    setSearch('');
  };

  return (
    <div className="relative flex-1">
      <Input
        placeholder={placeholder}
        role="searchbox"
        name="inventory-item-search"
        autoComplete="off"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setHighlighted(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
        onKeyDown={(e) => {
          if (!rows.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, rows.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = rows[highlighted];
            if (row) select(row);
          } else if (e.key === 'Escape') {
            setFocused(false);
          }
        }}
      />
      {focused && debounced.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-md">
          {query.isLoading || articleQuery.isLoading ? (
            <p className="px-3 py-2 text-sm text-muted">Suche …</p>
          ) : rows.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto py-1">
              {rows.map((row, index) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onMouseDown={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                    }}
                    onClick={() => select(row)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      index === highlighted ? 'bg-canvas' : 'hover:bg-canvas'
                    }`}
                  >
                    {row.kind === 'article' ? (
                      <>
                        <ArticleImageThumbnail articleId={row.article!.id} size="h-8 w-8" />
                        <span className="flex flex-1 flex-col">
                          <span>
                            <span className="text-ink">{row.article!.name}</span>
                            <span className="ml-1.5 text-xs text-muted">
                              ({row.article!.stock.available} verfügbar – nach Menge)
                            </span>
                          </span>
                          {findMatchedAlias(row.article!.aliases, debounced) && (
                            <Badge tone="purple" className="mt-0.5 self-start">
                              Alias: {findMatchedAlias(row.article!.aliases, debounced)}
                            </Badge>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <ArticleImageThumbnail articleId={row.item!.article.id} size="h-8 w-8" />
                        <span className="flex flex-1 flex-col">
                          <span className="text-ink">
                            {row.item!.article.name}{' '}
                            {row.item!.inventoryNumber && (
                              <span className="font-mono text-xs text-muted">{row.item!.inventoryNumber}</span>
                            )}
                          </span>
                          {findMatchedAlias(row.item!.article.aliases, debounced) && (
                            <Badge tone="purple" className="mt-0.5 self-start">
                              Alias: {findMatchedAlias(row.item!.article.aliases, debounced)}
                            </Badge>
                          )}
                          <span className="text-xs text-muted">
                            {row.item!.ownerOrganization.name} · {row.item!.location.name} ·{' '}
                            {INVENTORY_STATUS_LABEL[row.item!.status] ?? row.item!.status}
                          </span>
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted">Keine Treffer gefunden.</p>
          )}
        </div>
      )}
    </div>
  );
}
