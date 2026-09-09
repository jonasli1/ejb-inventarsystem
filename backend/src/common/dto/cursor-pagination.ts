import { AppBadRequestException } from '../exceptions/app.exception';

/** Opaque keyset-pagination cursor: base64url-encoded JSON of the sort key's last-seen value(s). */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T>(cursor: string): T {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw new AppBadRequestException(
      'Der angegebene Cursor ist ungültig.',
      'INVALID_CURSOR',
    );
  }
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/** Slices a `limit + 1`-sized result set into a page + next cursor, without a second count query. */
export function paginateByCursor<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => Record<string, unknown>,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return {
    data,
    nextCursor: hasMore ? encodeCursor(cursorOf(data[data.length - 1])) : null,
  };
}
