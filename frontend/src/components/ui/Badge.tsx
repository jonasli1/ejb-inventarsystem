import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import {
  ARTICLE_TYPE_LABEL,
  INVENTORY_STATUS_LABEL,
  LOAN_STATUS_LABEL,
  MOVEMENT_TYPE_LABEL,
} from '@/lib/status-labels';

type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'purple';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-black/5 text-ink dark:bg-white/10',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  purple: 'bg-brand-50 text-brand-700',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

const INVENTORY_STATUS_TONE: Record<string, Tone> = {
  available: 'green',
  borrowed: 'blue',
  maintenance: 'amber',
  defect: 'red',
  retired: 'neutral',
  installed: 'purple',
};

export function InventoryStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={INVENTORY_STATUS_TONE[status] ?? 'neutral'}>
      {INVENTORY_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const LOAN_STATUS_TONE: Record<string, Tone> = {
  requested: 'amber',
  approved: 'blue',
  issued: 'purple',
  completed: 'green',
};

export function LoanStatusBadge({ status }: { status: string }) {
  return <Badge tone={LOAN_STATUS_TONE[status] ?? 'neutral'}>{LOAN_STATUS_LABEL[status] ?? status}</Badge>;
}

export function ArticleTypeBadge({ type }: { type: string }) {
  return <Badge tone="purple">{ARTICLE_TYPE_LABEL[type] ?? type}</Badge>;
}

const MOVEMENT_TYPE_TONE: Record<string, Tone> = {
  in: 'green',
  out: 'neutral',
  move: 'blue',
  adjust: 'amber',
  status_change: 'purple',
  condition_change: 'amber',
};

export function StockMovementTypeBadge({ type }: { type: string }) {
  return (
    <Badge tone={MOVEMENT_TYPE_TONE[type] ?? 'neutral'}>{MOVEMENT_TYPE_LABEL[type] ?? type}</Badge>
  );
}
