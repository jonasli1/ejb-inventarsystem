import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Prisma's DATABASE_URL uses a `?schema=` query param that isn't a valid
 * libpq connection parameter, so pg_dump/pg_restore reject it outright.
 * Strips it out and returns it separately as a `--schema` flag instead.
 */
function toLibpqUrl(databaseUrl: string): { url: string; schema?: string } {
  const parsed = new URL(databaseUrl);
  const schema = parsed.searchParams.get('schema') ?? undefined;
  parsed.searchParams.delete('schema');
  return { url: parsed.toString(), schema };
}

/** Runs `pg_dump -Fc` (custom format: compressed, restorable with pg_restore). */
export async function pgDump(
  databaseUrl: string,
  outFile: string,
): Promise<void> {
  const { url, schema } = toLibpqUrl(databaseUrl);
  await execFileAsync(
    'pg_dump',
    [
      url,
      '-Fc',
      '--no-owner',
      ...(schema ? ['--schema', schema] : []),
      '-f',
      outFile,
    ],
    { maxBuffer: 1024 * 1024 * 64 },
  );
}

/**
 * Validates a pg_dump custom-format file without touching the database.
 * Throws if the file is missing, truncated, or otherwise corrupted.
 */
export async function pgRestoreValidate(dumpFile: string): Promise<void> {
  await execFileAsync('pg_restore', ['--list', dumpFile], {
    maxBuffer: 1024 * 1024 * 16,
  });
}

/** Restores a dump, dropping/recreating every object it describes first. */
export async function pgRestoreApply(
  databaseUrl: string,
  dumpFile: string,
): Promise<void> {
  const { url } = toLibpqUrl(databaseUrl);
  await execFileAsync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '-d', url, dumpFile],
    { maxBuffer: 1024 * 1024 * 64 },
  );
}
