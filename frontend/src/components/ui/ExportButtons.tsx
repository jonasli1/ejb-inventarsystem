import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from './Button';
import { useToast } from './toast';
import { getApiErrorMessage } from '@/lib/api-client';
import type { ExportFormat } from '@/lib/export';

export function ExportButtons({
  onExport,
  size = 'sm',
}: {
  onExport: (format: ExportFormat) => Promise<void>;
  size?: 'sm' | 'md';
}) {
  const toast = useToast();
  const [loading, setLoading] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    setLoading(format);
    try {
      await onExport(format);
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Export fehlgeschlagen.'), 'error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size={size}
        loading={loading === 'xlsx'}
        onClick={() => void run('xlsx')}
      >
        <FileSpreadsheet size={14} />
        Excel
      </Button>
      <Button
        type="button"
        variant="secondary"
        size={size}
        loading={loading === 'pdf'}
        onClick={() => void run('pdf')}
      >
        <FileText size={14} />
        PDF
      </Button>
    </div>
  );
}
