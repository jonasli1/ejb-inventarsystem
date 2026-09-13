/**
 * The first article alias containing the given search term, or `undefined`
 * if none matches (or the term is empty). Used to show *why* an item with a
 * different official article name surfaced in a search - the backend
 * already matches aliases (see `buildSearchWhere` in
 * backend/src/inventory/inventory.service.ts), but doesn't report which
 * alias matched, so this is recomputed client-side from the already-present
 * `article.aliases` field.
 */
export function findMatchedAlias(aliases: string[], query: string): string | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;
  return aliases.find((alias) => alias.toLowerCase().includes(needle));
}
