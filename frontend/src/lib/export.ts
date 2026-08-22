import { api } from './api-client';

export type ExportFormat = 'xlsx' | 'pdf';

function filenameFromDisposition(disposition: unknown, fallback: string): string {
  const value = typeof disposition === 'string' ? disposition : undefined;
  const match = value?.match(/filename="?([^"]+)"?/);
  return match ? decodeURIComponent(match[1]) : fallback;
}

export async function downloadExport(
  path: string,
  params: Record<string, string | number | string[] | undefined>,
  fallbackFilename: string,
): Promise<void> {
  const res = await api.get(path, { params, responseType: 'blob' });
  const filename = filenameFromDisposition(res.headers['content-disposition'], fallbackFilename);
  const url = URL.createObjectURL(res.data as Blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
