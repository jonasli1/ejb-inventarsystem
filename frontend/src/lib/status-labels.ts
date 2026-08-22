export const INVENTORY_STATUS_LABEL: Record<string, string> = {
  available: 'Verfügbar',
  borrowed: 'Ausgeliehen',
  maintenance: 'Wartung',
  defect: 'Defekt',
  retired: 'Ausgemustert',
  installed: 'Fest installiert (nicht ausleihbar)',
};

/**
 * Statuses a person can pick in an edit/create form. "borrowed" is excluded —
 * it is only ever set by the loan checkout/return workflow, never manually.
 */
export const MANUALLY_ASSIGNABLE_INVENTORY_STATUSES = Object.keys(
  INVENTORY_STATUS_LABEL,
).filter((status) => status !== 'borrowed') as (keyof typeof INVENTORY_STATUS_LABEL)[];

export const LOAN_STATUS_LABEL: Record<string, string> = {
  requested: 'Beantragt',
  approved: 'Genehmigt',
  issued: 'Herausgegeben',
  completed: 'Abgeschlossen',
};

export const ATTACHMENT_CATEGORY_LABEL: Record<string, string> = {
  image: 'Produktfoto',
  document: 'Dokument',
  inspection: 'Prüfdokument',
  checkoutPhoto: 'Foto bei Ausgabe',
  returnPhoto: 'Foto bei Rückgabe',
};

export const BACKUP_FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
};

export const ARTICLE_TYPE_LABEL: Record<string, string> = {
  UNIQUE: 'Einzelobjekt',
  BULK: 'Mehrfachobjekt',
  CONSUMABLE: 'Verbrauchsobjekt',
};

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  in: 'Zugang',
  out: 'Abgang',
  move: 'Umlagerung',
  adjust: 'Anpassung',
  status_change: 'Statusänderung',
  condition_change: 'Zustandsänderung',
};
