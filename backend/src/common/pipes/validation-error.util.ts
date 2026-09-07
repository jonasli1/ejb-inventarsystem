import type { ValidationError } from 'class-validator';

// Human-friendly German labels for the field names that appear most often in
// validation errors. Anything not listed here falls back to the raw
// property name, which is still understandable (camelCase DTO field), just
// not as polished.
const FIELD_LABELS: Record<string, string> = {
  email: 'E-Mail-Adresse',
  password: 'Passwort',
  newPassword: 'Neues Passwort',
  currentPassword: 'Aktuelles Passwort',
  newPasswordConfirmation: 'Passwort-Bestätigung',
  displayName: 'Anzeigename',
  name: 'Name',
  description: 'Beschreibung',
  inventoryNumber: 'Inventarnummer',
  serialNumber: 'Seriennummer',
  purchasePrice: 'Anschaffungspreis',
  purchaseDate: 'Anschaffungsdatum',
  nextDguvV3Check: 'Nächste DGUV-V3-Prüfung',
  status: 'Status',
  quantity: 'Menge',
  articleId: 'Artikel',
  locationId: 'Standort',
  roomId: 'Raum',
  categoryId: 'Kategorie',
  ownerOrganizationId: 'Eigentümer-Organisation',
  ownerUnitId: 'Eigentümer-Bereich',
  toRoomId: 'Zielraum',
  dueDate: 'Fälligkeitsdatum',
  checkoutDate: 'Ausleihdatum',
  startDate: 'Startdatum',
  endDate: 'Enddatum',
  borrowerName: 'Name der ausleihenden Person',
  borrowerEmail: 'E-Mail der ausleihenden Person',
  borrowerPhone: 'Telefonnummer der ausleihenden Person',
  borrowerStreet: 'Straße der ausleihenden Person',
  borrowerCity: 'Ort der ausleihenden Person',
  aliases: 'Kosenamen',
  notes: 'Notizen',
};

function labelFor(property: string): string {
  const lastSegment = property.split('.').pop() ?? property;
  return FIELD_LABELS[lastSegment] ?? lastSegment;
}

function extractNumber(originalMessage: string): string {
  const match = /(\d+)/.exec(originalMessage);
  return match ? match[1] : '';
}

const CONSTRAINT_MESSAGES: Record<
  string,
  (label: string, originalMessage: string) => string
> = {
  isNotEmpty: (l) => `${l} darf nicht leer sein.`,
  isDefined: (l) => `${l} ist erforderlich.`,
  isEmail: (l) => `${l} muss eine gültige E-Mail-Adresse sein.`,
  isString: (l) => `${l} muss Text sein.`,
  isInt: (l) => `${l} muss eine ganze Zahl sein.`,
  isNumber: (l) => `${l} muss eine Zahl sein.`,
  isPositive: (l) => `${l} muss eine positive Zahl sein.`,
  isBoolean: (l) => `${l} muss "true" oder "false" sein.`,
  isEnum: (l) => `${l} enthält einen ungültigen Wert.`,
  isUUID: (l) => `${l} muss eine gültige ID sein.`,
  isUrl: (l) => `${l} muss eine gültige URL sein.`,
  isDateString: (l) => `${l} muss ein gültiges Datum sein.`,
  isObject: (l) => `${l} muss ein Objekt sein.`,
  isArray: (l) => `${l} muss eine Liste sein.`,
  arrayMinSize: (l, o) =>
    `${l} muss mindestens ${extractNumber(o)} Einträge enthalten.`,
  arrayMaxSize: (l, o) =>
    `${l} darf höchstens ${extractNumber(o)} Einträge enthalten.`,
  arrayNotEmpty: (l) => `${l} darf nicht leer sein.`,
  minLength: (l, o) =>
    `${l} muss mindestens ${extractNumber(o)} Zeichen lang sein.`,
  maxLength: (l, o) =>
    `${l} darf höchstens ${extractNumber(o)} Zeichen lang sein.`,
  min: (l, o) => `${l} muss mindestens ${extractNumber(o)} sein.`,
  max: (l, o) => `${l} darf höchstens ${extractNumber(o)} sein.`,
  isNotEmptyObject: (l) => `${l} darf nicht leer sein.`,
  isIn: (l) => `${l} enthält einen ungültigen Wert.`,
  matches: (l) => `${l} hat ein ungültiges Format.`,
  maxDecimalPlaces: (l) => `${l} hat zu viele Nachkommastellen.`,
  whitelistValidation: () => `Es wurde ein unbekanntes Feld übermittelt.`,
};

function translateConstraint(
  property: string,
  constraintKey: string,
  originalMessage: string,
): string {
  const label = labelFor(property);
  const translate = CONSTRAINT_MESSAGES[constraintKey];
  if (translate) return translate(label, originalMessage);
  return `${label}: Ungültiger Wert.`;
}

/** Flattens (possibly nested) class-validator errors into German messages. */
export function translateValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      for (const [key, original] of Object.entries(error.constraints)) {
        messages.push(translateConstraint(path, key, original));
      }
    }
    if (error.children?.length) {
      messages.push(...translateValidationErrors(error.children, path));
    }
  }
  return messages.length ? messages : ['Die Anfrage enthält ungültige Daten.'];
}
