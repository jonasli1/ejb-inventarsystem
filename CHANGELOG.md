# CHANGELOG – Backend-Überarbeitung (2026-09-09)

Dieser Eintrag fasst die Backend-Überarbeitung für das Frontend-Team zusammen:
alle neuen/geänderten API-Endpunkte, Breaking Changes und das neue
Fehlerformat. Migrationen sind durchgängig datenerhaltend; bestehende Daten
gehen nirgends verloren.

Vollständiger Commit-Verlauf: `fix(backend): resolve login 429s...` bis
`fix(i18n): translate remaining English error messages...` (8 Commits).

## ⚠️ Breaking Changes

1. **`Article.type` (UNIQUE/BULK/CONSUMABLE) entfernt.**
   Jede Einheit verhält sich jetzt wie der frühere Typ `BULK` (ein
   `InventoryItem` pro physischem Objekt, eigener Status). Das Feld `type`
   ist aus allen Article-DTOs (Request und Response) verschwunden. Frontend
   darf `type` nicht mehr senden oder erwarten.

2. **`InventoryItem.conditionPercent` entfernt.**
   Feld ist aus Create/Update-DTOs, Response-Serialisierung und Filtern
   verschwunden. Zustandserfassung bei Ausleihe/Rückgabe (`checkedOutCondition`
   / `returnedCondition` auf `LoanItem`) bleibt für Altdaten in der DB
   erhalten, wird aber nicht mehr beschrieben.

3. **`inventoryNumber` ist optional und wird nie automatisch vergeben.**
   Vorher wurde bei fehlender Angabe automatisch eine Nummer generiert –
   das passiert nicht mehr. `null`/leer ist ein gültiger Zustand. Eindeutigkeit
   gilt nur unter nicht-ausgemusterten Objekten (case-insensitive); nach dem
   Ausmustern (`status: retired`) wird die Nummer wieder frei. Ein Konflikt
   liefert `409` mit `code: DUPLICATE_INVENTORY_NUMBER`.

4. **`purchaseDate` hat keinen Default mehr.**
   Wird beim Anlegen kein Wert übergeben, bleibt das Feld `null` statt auf
   das aktuelle Datum zu fallen.

5. **`GET /inventory` (flache Liste, `grouped=false`/Default) nutzt jetzt
   Cursor- statt Offset-Pagination.**
   - Neue Query-Parameter: `cursor` (aus `nextCursor` der vorigen Antwort)
     und `limit` (Default 50, max. 200) **ersetzen** `page`/`pageSize` für
     diesen Modus.
   - `page`/`pageSize` funktionieren weiterhin, aber **nur** wenn
     `grouped=true` gesetzt ist (nach Artikel gruppierte Ansicht, weiterhin
     Offset-paginiert, da die Ergebnismenge dort klein/begrenzt ist).
   - Response-Shape der flachen Liste: `{ data: [...], nextCursor: string | null }`
     statt `{ data, total, page, pageSize }`.

6. **`GET /activity` liefert jetzt `{ data, nextCursor }` statt der alten
   Offset-Paginierung.** Übergabe des vorigen `nextCursor` als `cursor`, um
   die nächste Seite zu laden.

7. **Berechtigungs-Keys grundlegend granularer.**
   Die ~11 groben `*.manage`/`*.view`-Rechte sind einer ~40 Rechte
   umfassenden Matrix nach Ressource×Aktion gewichen (z. B. `articles.read`,
   `articles.create`, `articles.update`, `articles.delete`,
   `inventory.retire`, `inventory.change_inventory_number`, `loans.delete`,
   `audit.read`, ...). Jede Rolle wurde per Migration verlustfrei auf die
   neuen Rechte gemappt – niemand verliert Zugriff –, aber **jeder
   Frontend-Code, der auf einem alten Permission-Key wie `articles.manage`
   oder `loans.view` prüft, muss auf die neuen Keys umgestellt werden.**
   Vollständige, aktuelle Liste inkl. deutscher `displayName` +
   `description`: `GET /roles` bzw. das `Permission`-Modell selbst ist die
   Quelle der Wahrheit (`src/common/constants/permissions.ts` im Backend).
   Bekannte Umbenennungen: `loans.view` → `loans.read`,
   `inventory.change_inv_num` → `inventory.change_inventory_number`.

8. **Einheitliches Fehlerformat mit `code`-Feld.**
   Jede Fehlerantwort hat jetzt zusätzlich zu `statusCode`/`message` ein
   maschinenlesbares `code`-Feld, z. B.:
   ```json
   {
     "statusCode": 409,
     "message": "Die Inventarnummer \"A-123\" wird bereits verwendet.",
     "code": "DUPLICATE_INVENTORY_NUMBER"
   }
   ```
   Alle `message`-Texte sind jetzt durchgängig Deutsch (Validierung,
   Berechtigungsfehler, Konflikte, Rate-Limits, ...). Frontend-Fehlerbehandlung
   kann/sollte künftig auf `code` statt auf den `message`-Text matchen.

## 🆕 Neue Endpunkte

- `GET /inventory/:id/accessory-candidates?search=` – Kandidaten für eine
  Zubehör-Zuordnung, jeweils mit `eligible: boolean` und deutschsprachigem
  `reason`, falls nicht zulässig.
- `PUT /inventory/:id/accessory` – Zubehör zuordnen (Body: `{ accessoryItemId }`).
- `DELETE /inventory/:id/accessory/:accessoryId` – Zubehör-Zuordnung lösen.
- `DELETE /loans/:id` – Ausleihe endgültig löschen (Hard-Delete), erfordert
  neues Recht `loans.delete`; ohne Recht `403` (deutsch).
- `GET /audit` – Zentrales Audit-Log, filterbar nach `category`
  (`auth`/`loan`/`article`/`inventory`/`person`/`group`/`role`/`other`),
  Akteur, Entität, Zeitraum; Cursor-paginiert (`cursor`/`limit` →
  `{ data, nextCursor }`); erfordert `audit.read`.
- `GET /notifications/templates` – Liste aller Benachrichtigungs-Events mit
  aktuellem Titel/Body (oder Default) und den je Event verfügbaren
  `{{platzhalter}}`-Variablen.
- `GET /notifications/templates/:eventKey` – Einzelne Vorlage lesen.
- `PUT /notifications/templates/:eventKey` – Betreff/HTML-Body einer
  Vorlage setzen (erfordert `settings.manage`).
- `PUT /notifications/templates/:eventKey/reset` – Vorlage auf den
  eingebauten deutschen Default zurücksetzen.
- `GET /attachments/:id/thumbnail` und `GET /attachments/:id/medium` –
  liefern verkleinerte Bildvarianten (JPEG) eines Bild-Attachments zum
  Direkt-Anzeigen (`Cache-Control: immutable`, langlebig cachebar). Für
  Attachments, die vor dieser Änderung hochgeladen wurden, wird transparent
  auf das Original zurückgefallen.

## ✏️ Geänderte Endpunkte / Response-Felder

- **Attachments** (`GET /attachments`, Upload-Response): jedes Objekt trägt
  jetzt `thumbnailUrl`/`mediumUrl` (bei Kategorie `image`, sonst `null`) statt
  je Roh-Binärdaten einzubetten – Listen und Detail-Ansichten liefern nie
  mehr binäre Bilddaten direkt, nur URLs zum separaten Nachladen.
- **`InventoryItem`**: neue Felder `nextDguvV3Check` (optional, Datum) und
  `parentItemId`/zugeordnetes Zubehör; Detailansicht (`GET /inventory/:id`)
  liefert zusätzlich schreibgeschützt geerbte `article.notes` und
  `article.documents` (Attachment-Metadaten mit `origin: 'article'` zur
  Unterscheidung von eigenen Anhängen mit `origin: 'own'`).
- **`Article`**: neue Felder `notes` (getrennt von `description`) und
  `aliases: string[]` (Spitznamen), beide durchsuchbar über den bestehenden
  `search`-Parameter.
- **Alle Such-/Filter-Endpunkte für `email`** (Login, Nutzer anlegen,
  E-Mail ändern, Passwort vergessen): E-Mail wird serverseitig immer
  getrimmt und kleingeschrieben behandelt – Groß-/Kleinschreibung bei der
  Eingabe spielt keine Rolle mehr.
- **`POST /auth/login` (429-Verhalten geändert):** Rate-Limit wird jetzt
  korrekt pro tatsächlicher Client-IP **und** E-Mail geführt (vorher: durch
  einen fehlenden `trust proxy`-Header sah der Server hinter dem
  Reverse-Proxy alle Nutzer als eine IP – das war der Ursprung der breit
  gemeldeten „429 Too Many Requests“-Fehler). 429-Antworten sind jetzt
  ebenfalls Deutsch.
- **`InventoryItem.status`-Übergänge sind jetzt serverseitig geprüft**
  (vorher keine Prüfung): u. a. ist `maintenance → retired` jetzt explizit
  erlaubt; `retired` ist terminal (keine Rückkehr); `borrowed` ist weiterhin
  ausschließlich über den Ausleih-Workflow erreichbar/verlassbar. Ein
  unzulässiger Übergang liefert `409` mit `code: INVALID_STATUS_TRANSITION`
  und deutscher Meldung.

## 📄 PDF-Exporte

Keine API-Änderung, aber spürbar für Nutzer: Spaltenbreiten füllen die
Seite jetzt proportional, Zellinhalte werden mehrzeilig umgebrochen statt
abgeschnitten, Abschnitte werden nicht mehr mitten im Titel auf die nächste
Seite gerissen, und jede Seite hat einen Fußzeilen-Seitenzähler
(„Seite X von Y").

## Sonstiges

- `AuditLog`-Einträge gibt es jetzt auch für Auth-Events (Login-Erfolg/
  -Fehlschlag je Methode, Logout, Passwort-Reset) – vorher nicht protokolliert.
- Alle Migrationen sind datenerhaltend; bei der E-Mail-Normalisierung
  bricht die Migration kontrolliert ab (mit Auflistung der betroffenen
  Adressen), falls zwei Bestandskonten sich nur durch Groß-/Kleinschreibung
  unterscheiden würden – das erfordert dann manuelle Bereinigung vor dem
  Deploy.
