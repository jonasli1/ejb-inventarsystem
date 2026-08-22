import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarDays, LayoutTemplate, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api-client';
import type { Loan, LoanStatus, PaginatedResult } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { LoanStatusBadge } from '@/components/ui/Badge';
import { LOAN_STATUS_LABEL } from '@/lib/status-labels';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { LoanCreateModal } from './LoanCreateModal';
import { LoanDetailModal } from './LoanDetailModal';
import { LoanTemplatesModal } from './LoanTemplatesModal';

const STATUS_OPTIONS: LoanStatus[] = ['requested', 'approved', 'issued', 'completed'];

export function LoansPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.LOANS_MANAGE);
  const canAdminister = hasPermission(PERMISSIONS.LOANS_ADMINISTER);
  const canView = canManage || hasPermission(PERMISSIONS.LOANS_VIEW) || canAdminister;
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [viewingLoan, setViewingLoan] = useState<Loan | null>(null);

  return (
    <div>
      <PageHeader
        title="Ausleihe"
        description="Ausleihvorgänge beantragen, genehmigen, ausgeben und zurücknehmen."
        actions={
          <>
            {canAdminister && (
              <Button variant="secondary" onClick={() => setTemplatesOpen(true)}>
                <LayoutTemplate size={16} />
                Vorlagen
              </Button>
            )}
            <Link to="/calendar">
              <Button variant="secondary">
                <CalendarDays size={16} />
                Kalender
              </Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Neue Ausleihe
            </Button>
          </>
        }
      />

      {canView ? (
        <LoansList onSelect={setViewingLoan} />
      ) : (
        <Card>
          <div className="p-8 text-center text-sm text-muted">
            Du kannst neue Ausleihen beantragen. Zum Einsehen bestehender Ausleihen fehlt dir die
            Berechtigung <code className="rounded bg-black/5 px-1 py-0.5">loans.view</code>.
            Direkt nach dem Anlegen kannst du eine Ausleihe trotzdem im Detail einsehen.
          </div>
        </Card>
      )}

      <LoanCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(loan) => setViewingLoan(loan)}
      />
      {canAdminister && (
        <LoanTemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      )}
      {viewingLoan && (
        <LoanDetailModal
          loanId={viewingLoan.id}
          initialLoan={viewingLoan}
          onClose={() => setViewingLoan(null)}
        />
      )}
    </div>
  );
}

function LoansList({ onSelect }: { onSelect: (loan: Loan) => void }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LoanStatus | ''>('');

  const query = useQuery({
    queryKey: ['loans', page, status],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Loan>>('/loans', {
          params: { page, pageSize: 20, ...(status ? { status } : {}) },
        })
      ).data,
  });

  return (
    <>
      <Card className="mb-4">
        <div className="flex items-end gap-3 p-4">
          <div className="w-56">
            <label className="mb-1.5 block text-xs font-medium text-muted">Status</label>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as LoanStatus | '');
                setPage(1);
              }}
            >
              <option value="">Alle</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {LOAN_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !query.data || query.data.data.length === 0 ? (
          <EmptyState title="Keine Ausleihen gefunden" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Ausleiher</th>
                  <th className="px-5 py-2.5">Objekte</th>
                  <th className="px-5 py-2.5">Geplantes Datum</th>
                  <th className="px-5 py-2.5">Fällig am</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((loan) => (
                  <tr
                    key={loan.id}
                    onClick={() => onSelect(loan)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-canvas"
                  >
                    <td className="px-5 py-2.5 text-ink">{loan.borrowerName ?? loan.borrowerPersonId}</td>
                    <td className="px-5 py-2.5 text-muted">
                      {loan.items.length} Objekt{loan.items.length === 1 ? '' : 'e'}
                    </td>
                    <td className="px-5 py-2.5 text-muted">
                      {format(new Date(loan.checkoutDate), 'dd.MM.yyyy')}
                    </td>
                    <td className="px-5 py-2.5 text-muted">
                      {loan.dueDate ? format(new Date(loan.dueDate), 'dd.MM.yyyy') : '–'}
                    </td>
                    <td className="px-5 py-2.5">
                      <LoanStatusBadge status={loan.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.data && (
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
