export const INVENTORY_STATUS_LABEL: Record<string, string> = {
  available: 'Verfügbar',
  borrowed: 'Ausgeliehen',
  maintenance: 'Wartung',
  defect: 'Defekt',
  retired: 'Ausgemustert',
  installed: 'Fest installiert (nicht ausleihbar)',
};

export const LOAN_STATUS_LABEL: Record<string, string> = {
  requested: 'Beantragt',
  approved: 'Genehmigt',
  issued: 'Herausgegeben',
  completed: 'Abgeschlossen',
};

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  in: 'Zugang',
  out: 'Abgang',
  move: 'Umlagerung',
  adjust: 'Anpassung',
  status_change: 'Statusänderung',
  condition_change: 'Zustandsänderung',
};

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('de-DE');
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('de-DE');
}

export function fmtPrice(
  p: { toString(): string } | number | string | null | undefined,
): string {
  if (p == null) return '';
  return `${Number(p).toFixed(2)} €`;
}

export function describeMovement(m: {
  oldStatus: string | null;
  newStatus: string | null;
  fromRoom: { name: string } | null;
  toRoom: { name: string } | null;
  oldCondition: number | null;
  newCondition: number | null;
}): string {
  if (m.oldStatus && m.newStatus) {
    return `${INVENTORY_STATUS_LABEL[m.oldStatus] ?? m.oldStatus} → ${INVENTORY_STATUS_LABEL[m.newStatus] ?? m.newStatus}`;
  }
  if (m.fromRoom && m.toRoom) {
    return `${m.fromRoom.name} → ${m.toRoom.name}`;
  }
  if (m.oldCondition != null && m.newCondition != null) {
    return `${m.oldCondition}% → ${m.newCondition}%`;
  }
  return '';
}
