import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { Article, PaginatedResult } from '@/lib/api-types';
import { Input } from '@/components/ui/Input';
import { ArticleImageThumbnail } from '@/components/ui/ArticleImageThumbnail';

/**
 * Server-searched, debounced combobox for picking an article (by name,
 * alias, category or manufacturer - all handled by the /articles?search=
 * endpoint), replacing a plain <select> that would otherwise have to load
 * the entire catalog into the client.
 */
export function ArticleSearchSelect({
  selected,
  onSelect,
  onClear,
}: {
  selected: Article | null;
  onSelect: (article: Article) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const debounced = useDebouncedValue(search, 250);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = useQuery({
    queryKey: ['articles', 'search-select', debounced],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Article>>('/articles', {
          params: { search: debounced.trim() || undefined, pageSize: 10 },
        })
      ).data.data,
    enabled: focused,
  });

  const results = query.data ?? [];

  if (selected) {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm">
        <ArticleImageThumbnail articleId={selected.id} size="h-6 w-6" enlargeable={false} />
        <span className="flex-1 truncate text-ink">{selected.name}</span>
        <button type="button" onClick={onClear} className="text-xs text-brand-600 hover:underline">
          Ändern
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex-1">
      <Input
        placeholder="Suche nach Name, Kosename, Kategorie, Hersteller …"
        role="searchbox"
        name="article-picker-search"
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
          if (!results.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const article = results[highlighted];
            if (article) onSelect(article);
          } else if (e.key === 'Escape') {
            setFocused(false);
          }
        }}
      />
      {focused && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-md">
          {query.isLoading ? (
            <p className="px-3 py-2 text-sm text-muted">Suche …</p>
          ) : results.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto py-1">
              {results.map((article, index) => (
                <li key={article.id}>
                  <button
                    type="button"
                    onMouseDown={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                    }}
                    onClick={() => onSelect(article)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      index === highlighted ? 'bg-canvas' : 'hover:bg-canvas'
                    }`}
                  >
                    <ArticleImageThumbnail articleId={article.id} size="h-8 w-8" />
                    <span className="flex-1">
                      <span className="text-ink">{article.name}</span>
                      {article.category && <span className="ml-1.5 text-xs text-muted">({article.category.name})</span>}
                    </span>
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
