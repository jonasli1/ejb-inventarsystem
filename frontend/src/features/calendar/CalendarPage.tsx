import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api-client';
import type { CalendarLoanEntry, LoanBlackoutPeriod } from '@/lib/api-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/lib/permissions';
import { LOAN_STATUS_LABEL } from '@/lib/status-labels';
import { LoanDetailModal } from '../loans/LoanDetailModal';

const STATUS_TONE_CLASS: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  issued: 'bg-brand-100 text-brand-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

function loanIntervalOverlapsDay(loan: CalendarLoanEntry, day: Date): boolean {
  const start = parseISO(loan.checkoutDate);
  const end = loan.dueDate ? parseISO(loan.dueDate) : start;
  return isWithinInterval(day, { start, end }) || isSameDay(start, day) || isSameDay(end, day);
}

function blackoutPeriodsForDay(periods: LoanBlackoutPeriod[], day: Date): LoanBlackoutPeriod[] {
  return periods.filter((p) => {
    const start = parseISO(p.startDate);
    const end = parseISO(p.endDate);
    return isWithinInterval(day, { start, end }) || isSameDay(start, day) || isSameDay(end, day);
  });
}

export function CalendarPage() {
  const { hasPermission } = useAuth();
  const canAdministerLoans = hasPermission(PERMISSIONS.LOANS_ADMINISTER);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const query = useQuery({
    queryKey: ['loans', 'calendar', gridStart.toISOString(), gridEnd.toISOString()],
    queryFn: async () =>
      (
        await api.get<CalendarLoanEntry[]>('/loans/calendar', {
          params: { from: gridStart.toISOString(), to: gridEnd.toISOString() },
        })
      ).data,
  });

  const blackoutQuery = useQuery({
    queryKey: ['loans', 'blackout-periods'],
    queryFn: async () => (await api.get<LoanBlackoutPeriod[]>('/loans/blackout-periods')).data,
    enabled: canAdministerLoans,
  });
  const blackoutPeriods = blackoutQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Kalender"
        description="Übersicht aller geplanten, genehmigten und laufenden Ausleihen."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMonth(subMonths(month, 1))}>
              <ChevronLeft size={15} />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
              Heute
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight size={15} />
            </Button>
          </div>
        }
      />

      <h2 className="mb-3 text-lg font-semibold text-ink">{format(month, 'MMMM yyyy', { locale: de })}</h2>

      <Card>
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
              <div key={d} className="bg-canvas px-2 py-1.5 text-center text-xs font-medium text-muted">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const dayLoans = (query.data ?? []).filter((l) => loanIntervalOverlapsDay(l, day));
              const dayBlackouts = blackoutPeriodsForDay(blackoutPeriods, day);
              const isBlocked = dayBlackouts.length > 0;
              return (
                <div
                  key={day.toISOString()}
                  title={isBlocked ? dayBlackouts.map((p) => p.reason ?? 'Sperrzeit').join(', ') : undefined}
                  className={`min-h-[100px] p-1.5 ${isBlocked ? 'bg-red-50' : 'bg-white'} ${!isSameMonth(day, month) ? 'opacity-40' : ''}`}
                >
                  <p
                    className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      isToday(day) ? 'bg-brand-600 text-white' : 'text-muted'
                    }`}
                  >
                    {format(day, 'd')}
                  </p>
                  <div className="flex flex-col gap-1">
                    {dayLoans.slice(0, 3).map((loan) => (
                      <button
                        key={loan.id}
                        onClick={() => setSelectedLoanId(loan.id)}
                        title={`${loan.borrowerName ?? loan.borrowerPersonId ?? ''} · ${LOAN_STATUS_LABEL[loan.status]}`}
                        className={`truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${STATUS_TONE_CLASS[loan.status] ?? 'bg-black/5 text-ink'}`}
                      >
                        {loan.borrowerName ?? loan.borrowerPersonId ?? 'Ausleihe'}
                      </button>
                    ))}
                    {dayLoans.length > 3 && (
                      <span className="px-1.5 text-[11px] text-muted">+{dayLoans.length - 3} mehr</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {canAdministerLoans && <BlackoutPeriodsPanel periods={blackoutPeriods} isLoading={blackoutQuery.isLoading} />}

      {selectedLoanId && (
        <LoanDetailModal loanId={selectedLoanId} onClose={() => setSelectedLoanId(null)} />
      )}
    </div>
  );
}

interface BlackoutPeriodForm {
  startDate: string;
  endDate: string;
  reason: string;
}

function BlackoutPeriodsPanel({
  periods,
  isLoading,
}: {
  periods: LoanBlackoutPeriod[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, reset } = useForm<BlackoutPeriodForm>({
    defaultValues: { startDate: '', endDate: '', reason: '' },
  });

  const createMutation = useMutation({
    mutationFn: async (values: BlackoutPeriodForm) =>
      api.post('/loans/blackout-periods', {
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loans', 'blackout-periods'] });
      toast.push('Sperrzeit wurde angelegt.');
      reset();
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/loans/blackout-periods/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loans', 'blackout-periods'] });
      toast.push('Sperrzeit wurde gelöscht.');
    },
    onError: (err) => toast.push(getApiErrorMessage(err), 'error'),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Sperrzeiten für Ausleihen</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-4 text-sm text-muted">
          Während einer Sperrzeit sind für alle Nutzer, auch mit voller Berechtigung, keine Ausleihen möglich.
        </p>

        <form
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
          className="mb-4 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[150px]">
            <Field label="Start">
              <Input type="date" required {...register('startDate', { required: true })} />
            </Field>
          </div>
          <div className="min-w-[150px]">
            <Field label="Ende">
              <Input type="date" required {...register('endDate', { required: true })} />
            </Field>
          </div>
          <div className="min-w-[200px] flex-1">
            <Field label="Grund (optional)">
              <Input {...register('reason')} placeholder="z. B. Umbauarbeiten" />
            </Field>
          </div>
          <Button type="submit" loading={createMutation.isPending}>
            <Plus size={14} />
            Sperrzeit anlegen
          </Button>
        </form>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : periods.length === 0 ? (
          <p className="text-sm text-muted">Keine Sperrzeiten vorhanden.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {periods.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-ink">
                    {format(parseISO(p.startDate), 'dd.MM.yyyy')} – {format(parseISO(p.endDate), 'dd.MM.yyyy')}
                  </span>
                  {p.reason && <span className="ml-2 text-muted">{p.reason}</span>}
                </span>
                <button
                  type="button"
                  title="Sperrzeit löschen"
                  className="shrink-0 p-1 text-muted hover:text-red-600"
                  onClick={() => {
                    if (window.confirm('Diese Sperrzeit wirklich löschen?')) {
                      deleteMutation.mutate(p.id);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
