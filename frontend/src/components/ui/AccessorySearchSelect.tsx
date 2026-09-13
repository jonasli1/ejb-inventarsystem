import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { findMatchedAlias } from '@/lib/matched-alias';
import type { AccessoryCandidate, PaginatedResult } from '@/lib/api-types';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ArticleImageThumbnail } from '@/components/ui/ArticleImageThumbnail';

/**
 * Search-and-select field for attaching another inventory item as accessory.
 * Candidates ineligible for the assignment (already has/is accessory,
 * retired, …) are shown grayed out with the backend's German reason instead
 * of being filtered out, so the "why not" stays visible.
 */
export function AccessorySearchSelect({
  itemId,
  onSelect,
}: {
  itemId: string;
  onSelect: (candidate: AccessoryCandidate) => void;
}) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const debounced = useDebouncedValue(search, 250);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const query = useQuery({
    queryKey: ['inventory', itemId, 'accessory-candidates', debounced],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<AccessoryCandidate>>(`/inventory/${itemId}/accessory-candidates`, {
          params: { search: debounced.trim() || undefined, pageSize: 10 },
        })
      ).data.data,
    enabled: focused,
  });

  return (
    <div className="relative">
      <Input
        placeholder="Objekt als Zubehör suchen (Name, Inventarnummer, Hersteller …)"
        role="searchbox"
        name="accessory-search"
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
      />
      {focused && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-md">
          {query.isLoading ? (
            <p className="px-3 py-2 text-sm text-muted">Suche …</p>
          ) : query.data && query.data.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto py-1">
              {query.data.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={!c.eligible}
                    onMouseDown={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                    }}
                    onClick={() => {
                      if (!c.eligible) return;
                      onSelect(c);
                      setSearch('');
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm ${
                      c.eligible ? 'hover:bg-canvas' : 'cursor-not-allowed opacity-50'
                    }`}
                  >
                    <ArticleImageThumbnail articleId={c.article.id} size="h-8 w-8" />
                    <span className="flex flex-1 flex-col">
                      <span className="text-ink">
                        {c.article.name}{' '}
                        {c.inventoryNumber && (
                          <span className="font-mono text-xs text-muted">{c.inventoryNumber}</span>
                        )}
                      </span>
                      {findMatchedAlias(c.article.aliases, debounced) && (
                        <Badge tone="purple" className="mt-0.5 self-start">
                          Alias: {findMatchedAlias(c.article.aliases, debounced)}
                        </Badge>
                      )}
                      <span className={`text-xs ${c.eligible ? 'text-muted' : 'text-red-600'}`}>
                        {c.eligible ? `${c.ownerOrganization.name} · ${c.location.name}` : c.reason}
                      </span>
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
