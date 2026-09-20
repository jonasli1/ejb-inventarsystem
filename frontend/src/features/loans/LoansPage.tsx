import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarDays, LayoutTemplate, Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { PERMISSION_INFO } from '@/lib/permission-labels';
import { LoanCreateModal } from './LoanCreateModal';
import { LoanDetailModal } from './LoanDetailModal';
import { LoanTemplatesModal } from './LoanTemplatesModal';

const STATUS_OPTIONS: LoanStatus[] = ['requested', 'approved', 'issued', 'completed'];

export function LoansPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.LOANS_MANAGE);
  const canAdminister = hasPermission(PERMISSIONS.LOANS_ADMINISTER);
  const canView = canManage || hasPermission(PERMISSIONS.LOANS_READ) || canAdminister;
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [openLoan, setOpenLoan] = useState<{ id: string; initial?: Loan } | null>(() => {
    const id = searchParams.get('loanId');
    return id ? { id } : null;
  });

  useEffect(() => {
    if (searchParams.get('loanId')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('loanId');
          return next;
        },
        { replace: true },
      );
    }
    // Only ever meant to consume a `?loanId=` param present on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <LoansList onSelect={(loan) => setOpenLoan({ id: loan.id, initial: loan })} />
      ) : (
        <Card>
          <div className="p-8 text-center text-sm text-muted">
            Du kannst neue Ausleihen beantragen. Zum Einsehen bestehender Ausleihen fehlt dir die
            Berechtigung <span className="font-medium text-ink">{PERMISSION_INFO[PERMISSIONS.LOANS_READ].label}</span>.
            Direkt nach dem Anlegen kannst du eine Ausleihe trotzdem im Detail einsehen.
          </div>
        </Card>
      )}

      <LoanCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(loan) => setOpenLoan({ id: loan.id, initial: loan })}
      />
      {canAdminister && (
        <LoanTemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      )}
      {openLoan && (
        <LoanDetailModal
          loanId={openLoan.id}
          initialLoan={openLoan.initial}
          onClose={() => setOpenLoan(null)}
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
          <div>
            <div className="hidden items-center gap-3 border-b border-border px-5 py-2.5 text-left text-xs font-medium text-muted sm:flex">
              <span className="flex-1">Betreff</span>
              <span className="w-24">Objekte</span>
              <span className="w-28">Geplantes Datum</span>
              <span className="w-28">Fällig am</span>
              <span className="w-28">Status</span>
            </div>
            <div className="divide-y divide-border">
              {query.data.data.map((loan) => (
                <div
                  key={loan.id}
                  onClick={() => onSelect(loan)}
                  className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-canvas sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink">{loan.subject}</p>
                    <p className="truncate text-xs text-muted">
                      {loan.borrowerName ?? loan.borrowerPersonId}
                      <span className="sm:hidden">
                        {' '}
                        · {loan.items.length} Objekt{loan.items.length === 1 ? '' : 'e'} ·{' '}
                        {format(new Date(loan.checkoutDate), 'dd.MM.yyyy')}
                        {loan.dueDate ? ` – ${format(new Date(loan.dueDate), 'dd.MM.yyyy')}` : ''}
                      </span>
                    </p>
                  </div>
                  <span className="hidden w-24 text-muted sm:inline">
                    {loan.items.length} Objekt{loan.items.length === 1 ? '' : 'e'}
                  </span>
                  <span className="hidden w-28 text-muted sm:inline">
                    {format(new Date(loan.checkoutDate), 'dd.MM.yyyy')}
                  </span>
                  <span className="hidden w-28 text-muted sm:inline">
                    {loan.dueDate ? format(new Date(loan.dueDate), 'dd.MM.yyyy') : '–'}
                  </span>
                  <span className="w-28 shrink-0">
                    <LoanStatusBadge status={loan.status} />
                  </span>
                </div>
              ))}
            </div>
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
