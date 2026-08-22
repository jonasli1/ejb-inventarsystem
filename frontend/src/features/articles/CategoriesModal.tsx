import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import { useCategories } from '@/lib/reference-data';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';

export function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: categories } = useCategories();
  const [name, setName] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => api.post('/categories', { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      setName('');
      toast.push('Kategorie wurde angelegt.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.push('Kategorie wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Kategorien verwalten" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createMutation.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <Input placeholder="Neue Kategorie" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" loading={createMutation.isPending}>
          <Plus size={15} />
        </Button>
      </form>

      <ul className="flex flex-col gap-1">
        {categories?.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-canvas"
          >
            {c.name}
            <button
              onClick={() => deleteMutation.mutate(c.id)}
              className="text-muted hover:text-red-600"
              aria-label={`${c.name} löschen`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {categories?.length === 0 && <p className="px-2.5 py-1.5 text-sm text-muted">Keine Kategorien vorhanden.</p>}
      </ul>
    </Modal>
  );
}
