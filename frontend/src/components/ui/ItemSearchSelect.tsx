import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useArticles } from '@/lib/reference-data';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { Article, InventoryItem, PaginatedResult } from '@/lib/api-types';
import { Input } from '@/components/ui/Input';
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
  const { data: articles } = useArticles();
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = useQuery({
    queryKey: ['inventory', 'universal-search', debounced],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<InventoryItem>>('/inventory', {
          params: { search: debounced, pageSize: 8 },
        })
      ).data.data,
    enabled: debounced.trim().length >= 2,
  });

  const rows: Row[] = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    if (needle.length < 2) return [];
    const articleRows: Row[] = allowArticles
      ? (articles ?? [])
          .filter((a) => a.type !== 'UNIQUE' && a.stock.available > 0 && a.name.toLowerCase().includes(needle))
          .slice(0, 3)
          .map((a) => ({ kind: 'article', key: `article-${a.id}`, article: a }))
      : [];
    const itemRows: Row[] = (query.data ?? []).map((i) => ({
      kind: 'item',
      key: `item-${i.id}`,
      item: i,
    }));
    return [...articleRows, ...itemRows];
  }, [allowArticles, articles, debounced, query.data]);

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
          {query.isLoading ? (
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
                        <span className="flex-1">
                          <span className="text-ink">{row.article!.name}</span>
                          <span className="ml-1.5 text-xs text-muted">
                            ({row.article!.stock.available} verfügbar – nach Menge)
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <ArticleImageThumbnail articleId={row.item!.article.id} size="h-8 w-8" />
                        <span className="flex flex-1 flex-col">
                          <span className="text-ink">
                            {row.item!.article.name}{' '}
                            <span className="font-mono text-xs text-muted">
                              {row.item!.inventoryNumber}
                            </span>
                          </span>
                          <span className="text-xs text-muted">
                            {row.item!.ownerOrganization.name} · {row.item!.location.name} · {row.item!.status}
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
