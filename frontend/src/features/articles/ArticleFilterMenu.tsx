import { useEffect, useRef, useState } from 'react';
import { Filter, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

export type ArticleFilterType = 'type' | 'categoryId';

export interface FilterValueOption {
  value: string;
  label: string;
}

const ARTICLE_FILTER_TYPE_LABEL: Record<ArticleFilterType, string> = {
  type: 'Typ',
  categoryId: 'Kategorie',
};

const FILTER_TYPES = Object.keys(ARTICLE_FILTER_TYPE_LABEL) as ArticleFilterType[];

export function ArticleFilterMenu({
  options,
  onAdd,
}: {
  options: Record<ArticleFilterType, FilterValueOption[]>;
  onAdd: (type: ArticleFilterType, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ArticleFilterType>('type');
  const [value, setValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const valueOptions = options[type];

  return (
    <div className="relative" ref={containerRef}>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
        <Filter size={14} />
        Filter hinzufügen
      </Button>
      {open && (
        <div className="absolute left-0 z-20 mt-1.5 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Filterart</label>
              <Select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ArticleFilterType);
                  setValue('');
                }}
              >
                {FILTER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ARTICLE_FILTER_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Wert</label>
              <Select value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Wählen …</option>
                {valueOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!value}
              onClick={() => {
                if (!value) return;
                onAdd(type, value);
                setValue('');
                setOpen(false);
              }}
            >
              <Plus size={14} />
              Hinzufügen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { ARTICLE_FILTER_TYPE_LABEL };
