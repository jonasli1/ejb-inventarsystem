# Konzept: Inventarsystem (Lagerverwaltung mit Ausleihe)

Dieses Dokument beschreibt ein logisch konsistentes Gesamtkonzept für ein Inventar-
und Lagerverwaltungssystem und dient als Grundlage für die schrittweise Umsetzung mit
Claude Code. Der konkrete Prompt für den ersten Schritt (Backend) steht ganz am Ende.

---

## 1. Zielbild & Grundprinzipien

- **Web-Anwendung**, responsiv optimiert für Mobilgeräte und Desktop.
- **Backend und Frontend strikt getrennt.** Das Backend ist eine eigenständige,
  authentifizierte REST-API. Das Frontend ist ein reiner API-Client. Kein Server-side
  Rendering, das das Frontend an das Backend koppelt.
- **Authentifizierung über drei Wege**, die alle im selben Nutzerkonto zusammenlaufen:
  ChurchTools (OAuth2/SSO), lokaler Login (Benutzername + Passwort) und Passkey (WebAuthn).
- **Rollen- und Rechtesystem** (RBAC) für Benutzerverwaltung, Rechtevergabe usw.
- **Hauptfunktion Lagerverwaltung:** Jedes Objekt hat einen Standort und einen Raum.
- **Ausleihe:** Objekte können ausgeliehen werden, eingetragen durch einen Nutzer.
- **Vorgerüstet für eine externe Verleih-Website:** Datenmodell und API werden so
  entworfen, dass eine öffentliche Buchungs-/Reservierungsanbindung später ohne Umbau
  angedockt werden kann.

---

## 2. Architekturüberblick

```
+---------------------------+        +---------------------------+
|   Frontend (SPA)          |        |  Externe Verleih-Website  |
|   Web + Mobile responsive |        |  (spätere Anbindung)      |
+-------------+-------------+        +-------------+-------------+
              |  HTTPS / JSON                      |  HTTPS / JSON
              |  (eigene API-Tokens)               |  (OAuth2 Client-Credentials
              v                                    |   oder API-Keys)
        +-----+------------------------------------+-----+
        |                 Backend-API                    |
        |  Auth  |  RBAC  |  Domänenlogik  |  OpenAPI-Doku |
        +--------------------+---------------------------+
                             |
                     +-------+--------+
                     |   Datenbank    |  (PostgreSQL)
                     +----------------+
                             |
                     +-------+--------+
                     | Objektspeicher |  (Bilder/Dateien, z. B. S3-kompatibel)
                     +----------------+
                             ^
                             |  OAuth2 (Authorization Code + PKCE)
                     +-------+--------+
                     |  ChurchTools   |  (als Identity Provider)
                     +----------------+
```

**Kernidee der Authentifizierung:** Alle drei Login-Wege münden in dieselbe Nutzer-
identität. Das Backend stellt anschließend **eigene** Access-/Refresh-Tokens aus. Das
Frontend spricht immer nur mit dem eigenen Backend und muss die Login-Methode nicht
kennen. Das entkoppelt das System von ChurchTools und macht Passkey/Passwort gleichwertig.

---

## 3. Authentifizierung & Autorisierung

### 3.1 Login-Methoden

1. **ChurchTools (OAuth2 / SSO)**
   - Das Backend ist OAuth2-**Client**. ChurchTools ist der Identity Provider.
   - Ablauf: Authorization-Code-Flow mit PKCE. Nutzer wird zu ChurchTools weitergeleitet,
     meldet sich dort an, wird mit einem Code zurückgeleitet; das Backend tauscht den Code
     gegen ein Token und liest die ChurchTools-Person aus.
   - Beim ersten Login: automatische Verknüpfung/Anlage eines lokalen Nutzerkontos
     (Mapping über die ChurchTools-Person-ID; E-Mail als Sekundär-Merkmal).
   - **Gruppenübernahme:** ChurchTools überträgt bei erfolgreichem OAuth-Login die
     Gruppenmitgliedschaften als Teil des Profils mit (Voraussetzung: In der OAuth2-Client-
     Konfiguration in ChurchTools ist der „groups claim" gesetzt). Diese Gruppen werden bei
     jedem Login synchronisiert und gespeichert (siehe Abschnitt 3.4).
   - Benötigte Konfiguration: `clientId`, `clientSecret`, `redirectUri`, `authorizationUrl`,
     `tokenUrl`, `profileUrl`, Basis-URL der ChurchTools-Instanz.
   - Hinweis für den Betrieb: In ChurchTools muss die OAuth2-Client-Registrierung
     angelegt, der „groups claim" aktiviert und den Nutzern die Berechtigung
     „Login to External System" erteilt werden.

2. **Lokaler Login (Benutzername + Passwort)**
   - Passwörter werden mit Argon2id (Fallback bcrypt) gehasht, niemals im Klartext.
   - Rate-Limiting und Sperrlogik gegen Brute-Force.
   - Optional: E-Mail-Verifikation und Passwort-Reset (Token-basiert).

3. **Passkey (WebAuthn / FIDO2)**
   - Registrierung und Anmeldung nach dem WebAuthn-Standard.
   - Ein Nutzer kann mehrere Passkeys hinterlegen (Geräte).
   - Serverseitig werden Credential-ID, Public Key und Signaturzähler gespeichert.

Ein Nutzer kann **mehrere Login-Methoden gleichzeitig** verknüpft haben (z. B.
ChurchTools + Passkey). Dafür gibt es eine eigene Tabelle für verknüpfte Identitäten.

### 3.2 Token-Modell (nach erfolgreichem Login)

- **Access-Token (JWT, kurzlebig, z. B. 15 Min.)** für API-Zugriffe.
- **Refresh-Token (langlebig, rotierend, serverseitig widerrufbar)** zum Erneuern.
- Refresh-Tokens werden gespeichert, damit sie einzeln (Gerät/Session) widerrufbar sind.
- Für die spätere **externe Verleih-Website** ist ein getrennter maschineller Zugang
  vorgesehen: OAuth2 Client-Credentials oder API-Keys mit eingeschränktem Scope
  (nur Lese-/Buchungsendpunkte), nicht die Nutzer-Tokens.

### 3.3 Rollen & Rechte (RBAC)

- **Permission**: feingranulare Einzelrechte, z. B.
  `users.manage`, `permissions.assign`, `roles.manage`, `articles.manage`,
  `inventory.manage`, `locations.manage`, `loans.create`, `loans.manage`,
  `inventory.view`, `reports.view`.
- **Role**: bündelt Permissions (z. B. „Admin", „Lagerwart", „Ausleiher", „Betrachter").
- **User ↔ Role**: n:m. Rechteprüfung erfolgt im Backend über Guards/Middleware pro Endpunkt.
- „Personen anlegen", „Berechtigungen verteilen" usw. sind damit reine Permission-Checks.

### 3.4 Gruppen (aus ChurchTools & manuell)

Nutzer haben **Gruppenmitgliedschaften**. Diese kommen aus zwei Quellen, die getrennt
gehalten werden:

- **`churchtools`** — beim Login über ChurchTools automatisch übernommen (aus dem OAuth-
  Profil / „groups claim"). Diese Mitgliedschaften werden bei **jedem** ChurchTools-Login
  synchronisiert: neue Gruppen kommen hinzu, in ChurchTools entfernte Gruppen werden auch
  hier entfernt.
- **`manual`** — von einem Admin manuell zugewiesen. Diese Mitgliedschaften werden von der
  ChurchTools-Synchronisation **niemals überschrieben oder entfernt**.

Umgesetzt wird das über ein `source`-Feld an der Mitgliedschaft. Der Sync-Algorithmus beim
Login betrifft **ausschließlich** Zeilen mit `source = 'churchtools'`; `manual`-Zeilen bleiben
unangetastet. Trägt ein Admin einen Nutzer in eine Gruppe ein, die auch aus ChurchTools käme,
bleibt die Mitgliedschaft auch dann bestehen, wenn ChurchTools sie nicht (mehr) liefert.

Gruppen sind zunächst eine reine Zugehörigkeits-/Organisationsinformation. Optional können
Gruppen später auf Rollen/Rechte gemappt werden (Gruppe → Rolle), ohne das Datenmodell zu
ändern.

---

## 4. Domänenmodell: Objekttypen

Zentraler Baustein ist die Trennung zwischen **Artikel** (Katalog/Definition) und
**Bestand** (physische Präsenz im Lager). Ein Artikel hat einen Typ, der das Verhalten steuert:

**Grundregel: Jedes physische Objekt ist ein eigener Bestandssatz mit eigener
Inventarnummer, eigenem Zustand und eigenem Standort/Raum — bei allen drei Typen.** Auch
jedes einzelne Kabel ist also einzeln adressierbar und anzeigbar. Der Typ steuert nur noch
die *Darstellung* (einzeln vs. gruppiert) und die *Art der Zustandsangabe*.

| Typ | Beispiel | Darstellung | Zustandsangabe |
|-----|----------|-------------|----------------|
| `UNIQUE` (Einzelobjekt) | Mischpult | Einzeln; i. d. R. ein Objekt je Artikel | diskreter Status (`available`, `borrowed`, `defect` …) |
| `BULK` (Mehrfachobjekt) | 5-m-Stromkabel | Viele Objekte je Artikel, in der UI **gruppiert** darstellbar, aber jederzeit auf jedes Einzelstück (Nummer, Zustand, Standort) aufklappbar | diskreter Status je Einheit |
| `CONSUMABLE` (Verbrauchsobjekt) | Rolle Klebeband | Wie `BULK` gruppiert, ebenfalls einzeln aufklappbar | zusätzlich Füllstand `condition_percent` 1–100 % je Einheit |

**Begründung des Designs:**
- Jede Einheit ist ein individueller `InventoryItem`-Datensatz mit `inventory_number`,
  `status`, `location`, `room`. Das gilt einheitlich für alle Typen — dadurch lässt sich
  jedes einzelne Kabel (und jedes andere Objekt) einzeln anzeigen und verfolgen.
- Der Unterschied zwischen `UNIQUE` und `BULK` ist damit primär eine Frage der
  **Standard-Darstellung**: Ein Mischpult zeigt man einzeln, Kabel zeigt man gebündelt
  („12× 5-m-Kabel, 10 verfügbar, 2 verliehen") mit Aufklapp-/Detailansicht je Einheit.
- `CONSUMABLE` verhält sich wie `BULK`, ergänzt aber pro Einheit einen prozentualen
  Füllstand (1–100 %) statt/zusätzlich zum diskreten Status.

Alle drei Typen teilen sich dieselbe Bestandstabelle. `condition_percent` wird per
DB-Constraint nur für `CONSUMABLE` zugelassen; `inventory_number` und der diskrete `status`
existieren für alle. Aggregierte Ansichten (Anzahl/Verfügbarkeit je Artikel) werden aus den
Einzeldatensätzen berechnet, nicht separat gespeichert — so bleiben Einzel- und
Gruppensicht immer konsistent.

### 4.1 Zweistufiger Eigentümer

Das System wird von mehreren kooperierenden Organisationen genutzt. Deshalb hat **jede
physische Einheit einen zweistufigen Eigentümer**:

- **Ebene 1 — Organisation** (`Organization`): die besitzende Organisation, z. B.
  „Gemeinde A", „Verein B".
- **Ebene 2 — Untereinheit** (`OrganizationUnit`): eine Abteilung/Gruppe innerhalb dieser
  Organisation, z. B. „Technik-Team", „Jugendarbeit". Muss zur gewählten Organisation gehören.

Wichtige Designentscheidungen:
- Eigentum sitzt am **`InventoryItem`** (Einzelstück), nicht am Artikel. So können mehrere
  Organisationen identische Artikel besitzen (Organisation A hat 5 Kabel, Organisation B hat
  3 baugleiche Kabel) und trotzdem sauber getrennt bleiben.
- Die Untereinheit ist über eine Fremdschlüssel-Beziehung fest an ihre Organisation gebunden,
  sodass die Zweistufigkeit konsistent bleibt.
- Eigentümer und Standort/Raum sind **unabhängig**: Ein Objekt von Organisation A kann im
  Lager von Organisation B liegen (kooperierende Nutzung) — Eigentum und physischer Ort
  werden getrennt geführt.
- Der Eigentümer ist gleichzeitig der natürliche Ansatzpunkt für spätere organisations-
  bezogene Sichtbarkeits-/Rechte-Einschränkungen (Mandantenlogik), falls gewünscht.

---

## 5. Lagerverwaltung (Standort & Raum)

- **Location (Standort):** Gebäude/Ort, z. B. „Gemeindehaus", „Außenlager Nord".
- **Room (Raum):** gehört zu einem Standort.
- Optional erweiterbar (später): Regal/Fach/Container als weitere Hierarchieebene unter dem
  Raum. Das Modell wird so angelegt, dass diese Ebene ohne Bruch ergänzt werden kann.
- Jeder Bestandssatz referenziert **genau einen Standort und einen Raum**.
- Bestandsbewegungen (Umlagerung, Zu-/Abgang, Statuswechsel) werden protokolliert, damit
  die Historie eines Objekts nachvollziehbar ist.

---

## 6. Ausleihe (intern) & Vorrüstung Verleih-Website

### 6.1 Interne Ausleihe

- Ein **Loan (Ausleihvorgang)** wird durch einen Nutzer eingetragen und enthält:
  - Ausleiher (interne Person **oder** freier Text/externer Name),
  - `lent_by` (der Nutzer, der den Vorgang erfasst),
  - Ausgabedatum, geplantes Rückgabedatum, tatsächliches Rückgabedatum,
  - Status (`open`, `returned`, `overdue`, `cancelled`), Notizen.
- **LoanItem (Positionen):** jede Position verweist auf **einen konkreten
  `InventoryItem`** (also ein bestimmtes Objekt mit Inventarnummer) — bei allen Typen. Bei
  `BULK`/`CONSUMABLE` kann die Oberfläche komfortabel „n verfügbare Einheiten" auswählen
  lassen; das System bucht dann konkrete Einzelstücke ein und merkt sich deren
  Inventarnummern. So ist bei der Rückgabe jederzeit klar, welches Kabel/welche Rolle mit
  welchem Zustand zurückkommt. Bei Ausgabe wird der Status der betroffenen Einheiten auf
  „ausgeliehen" gesetzt, bei Rückgabe zurückgesetzt (und ggf. der Füllstand aktualisiert).

### 6.2 Vorrüstung für die externe Verleih-Website

Damit die spätere öffentliche Verleih-Website ohne Umbau andocken kann, wird von Anfang an:
- eine **Verfügbarkeits-Abstraktion** vorgesehen (Ist ein Artikel/Objekt in einem Zeitraum
  frei?), sodass später auch **Reservierungen/Buchungen** neben der internen Ausleihe möglich sind,
- ein **maschineller, gescopeter API-Zugang** (Client-Credentials/API-Keys) mit eigenen,
  eingeschränkten Rechten eingeplant,
- der Loan-/Reservierungs-Datensatz um ein Feld `source` (`internal` / `external`) erweiterbar
  gehalten,
- die Domänenlogik in Services gekapselt, damit ein zweiter (öffentlicher) API-Layer dieselbe
  Logik wiederverwenden kann.

In Phase 1 wird dieser Teil nur **vorbereitet** (saubere Service-Schnitte, `source`-Feld,
Scopes im Auth-System), aber noch nicht als öffentliche Buchungs-API ausgebaut.

---

## 7. Datenmodell (Entitäten & Kernfelder)

- **User**: `id`, `display_name`, `email`, `is_active`, `created_at`.
- **AuthIdentity**: `id`, `user_id`, `provider` (`local` | `churchtools` | `passkey`),
  `provider_subject` (z. B. CT-Person-ID / Passkey-Credential-ID), typabhängige Felder
  (`password_hash` bei local; `public_key`, `sign_count` bei passkey).
- **Session/RefreshToken**: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`,
  `device_label`.
- **Role**: `id`, `name`, `description`.
- **Permission**: `id`, `key`, `description`.
- **RolePermission** (n:m), **UserRole** (n:m).
- **Group**: `id`, `name`, `external_ref` (optional, z. B. ChurchTools-Gruppen-ID),
  `description`.
- **UserGroup** (Mitgliedschaft): `id`, `user_id`, `group_id`,
  `source` (`churchtools` | `manual`), `created_at`. Der ChurchTools-Login-Sync betrifft
  nur `source = 'churchtools'`; `manual`-Einträge bleiben unangetastet.
- **Organization** (Eigentümer Ebene 1): `id`, `name`.
- **OrganizationUnit** (Eigentümer Ebene 2): `id`, `organization_id`, `name`.
- **Category**: `id`, `name`, `parent_id` (optional, hierarchisch).
- **Article**: `id`, `name`, `description`, `category_id`, `type`
  (`UNIQUE`|`BULK`|`CONSUMABLE`), `unit_of_measure`, `manufacturer`, `image_url`, `attributes` (JSON).
- **InventoryItem** (physische Einheit — ein Datensatz je Objekt, bei allen Typen):
  `id`, `article_id`, `location_id`, `room_id`,
  `owner_organization_id` (Eigentümer Ebene 1),
  `owner_unit_id` (Eigentümer Ebene 2, muss zur Organisation gehören),
  `inventory_number` (eindeutig, für alle Typen; bei Bedarf systemgeneriert),
  `status` (`available`|`borrowed`|`maintenance`|`defect`|`retired`),
  `serial_number` (optional, v. a. bei UNIQUE),
  `condition_percent` (nur bei CONSUMABLE, 1–100), `notes`.
  Aggregierte Kennzahlen je Artikel (Gesamtzahl, verfügbar, verliehen) werden aus diesen
  Einzeldatensätzen berechnet, nicht als Feld gespeichert.
- **Location**: `id`, `name`, `address`.
- **Room**: `id`, `location_id`, `name`.
- **StockMovement** (Historie je Einheit): `id`, `inventory_item_id`, `type`
  (`in`|`out`|`move`|`adjust`|`status_change`|`condition_change`), `from_room_id`,
  `to_room_id`, `old_status`, `new_status`, `old_condition`, `new_condition`,
  `user_id`, `created_at`, `note`.
- **Loan**: `id`, `borrower_person_id` (optional), `borrower_name` (optional, extern),
  `lent_by_user_id`, `source` (`internal`|`external`), `checkout_date`,
  `due_date`, `returned_at`, `status`, `notes`.
- **LoanItem**: `id`, `loan_id`, `inventory_item_id` (immer eine konkrete Einheit),
  `checked_out_condition`, `returned_condition`, `returned_at`.

Alle Tabellen mit `created_at` / `updated_at`; Soft-Delete wo sinnvoll.

---

## 8. API-Design (REST, versioniert unter `/api/v1`)

- **Auth**: `POST /auth/login` (lokal), `POST /auth/refresh`, `POST /auth/logout`,
  `GET /auth/me`, `GET /auth/churchtools/start`, `GET /auth/churchtools/callback`,
  `POST /auth/passkey/register/options`, `POST /auth/passkey/register/verify`,
  `POST /auth/passkey/login/options`, `POST /auth/passkey/login/verify`.
- **Users/Roles/Permissions**: CRUD unter `/users`, `/roles`, `/permissions`,
  Zuweisung von Rollen und Rechten.
- **Gruppen**: `/groups` (CRUD); `/users/{id}/groups` zum Anzeigen und für die **manuelle**
  Zuweisung/Entfernung durch Admins (immer `source = 'manual'`). Der ChurchTools-Sync läuft
  intern beim Login, nicht über diese Endpunkte.
- **Organisationen/Eigentümer**: `/organizations` und `/organizations/{id}/units` (CRUD der
  zwei Eigentümer-Ebenen).
- **Katalog**: `/categories`, `/articles` (CRUD, Filter nach Typ/Kategorie).
- **Bestand**: `/inventory` (CRUD einzelner Einheiten, Filter nach
  Standort/Raum/Status/Artikel/**Eigentümer-Organisation/Untereinheit**, Umschalten zwischen flacher Einzel- und nach Artikel
  gruppierter Ansicht), `/inventory/{id}/movements` (Historie je Einheit),
  `/inventory/{id}/move`, `/articles/{id}/units` (alle Einzelstücke eines Artikels).
- **Lager**: `/locations`, `/rooms`.
- **Ausleihe**: `/loans` (erstellen, auflisten, zurücknehmen), `/loans/{id}/return`.
- Durchgängig: Pagination, Filter, Sortierung, konsistente Fehlerobjekte.
- **OpenAPI/Swagger** automatisch generiert, damit das Frontend und die spätere
  Verleih-Website gegen einen dokumentierten Vertrag entwickeln können.

---

## 9. Technologie-Empfehlung

Empfohlener Standard-Stack (gut geeignet für RBAC, Guards, OAuth2, WebAuthn und
sauberen API-Vertrag):

- **Backend:** TypeScript + **NestJS** (klare Modulstruktur, Dependency Injection,
  Guards für Auth/RBAC), **PostgreSQL**, **Prisma** (Schema + Migrationen).
- **Auth-Bausteine:** `@simplewebauthn/server` (Passkey), Passport/OAuth2-Client für
  ChurchTools, `argon2` für Passwörter, JWT für Tokens.
- **API-Doku:** integriertes OpenAPI/Swagger.
- **Tests:** Jest (Unit) + Supertest (E2E).
- **Betrieb:** Docker-Compose (API + Postgres) für lokale Entwicklung.

Gleichwertige Alternative, falls Python bevorzugt wird: **FastAPI + SQLAlchemy + Alembic +
Authlib + webauthn**. Das Konzept bleibt identisch; nur der Prompt unten müsste angepasst werden.

---

## 10. Umsetzungs-Roadmap (Phasen)

1. **Backend-Fundament** (dieser Schritt): Projektsetup, Datenmodell + Migrationen,
   Authentifizierung (alle drei Methoden + Token/RBAC), CRUD für Katalog, Bestand, Lager,
   Ausleihe, OpenAPI-Doku, Seed-Daten, Tests.
2. **Frontend**: responsive SPA, Login-Flows, Lager-/Bestandsansichten, Ausleihe-Erfassung.
3. **Ausbau interne Ausleihe**: Fristen, Überfälligkeiten, Benachrichtigungen, Reports.
4. **Externe Verleih-Website**: öffentlicher, gescopeter API-Layer + Reservierungen/Buchungen.
5. **Feinschliff**: Barcode/QR, Import/Export, Audit-Log-Auswertungen.

---

## 11. Prompt für Claude Code — Phase 1 (Backend)

> Kopiere den folgenden Block als Startprompt in Claude Code. Er beschreibt ausschließlich
> den ersten Schritt (Backend inkl. Datenverwaltung/Speicherung und API-Authentifizierung).

---

**Aufgabe:** Baue das Backend für ein Inventar- und Lagerverwaltungssystem als
eigenständige, authentifizierte REST-API. Frontend wird später separat entwickelt — baue
also keinerlei UI, nur die API. Halte dich an das folgende Konzept.

**Tech-Stack:** TypeScript, NestJS, PostgreSQL, Prisma (Schema + Migrationen), JWT für
Tokens, Argon2 für Passwörter, `@simplewebauthn/server` für Passkeys, OAuth2-Client für
ChurchTools, integriertes OpenAPI/Swagger, Jest + Supertest für Tests, Docker-Compose für
lokale Entwicklung (API + Postgres). Verwende `.env` für alle Secrets und
Verbindungsdaten; lege eine `.env.example` an.

**Datenmodell (Prisma-Schema + Migrationen):** Implementiere die Entitäten `User`,
`AuthIdentity`, `RefreshToken`, `Role`, `Permission`, `RolePermission`, `UserRole`,
`Group`, `UserGroup`, `Organization`, `OrganizationUnit`, `Category`, `Article`,
`InventoryItem`, `Location`, `Room`, `StockMovement`, `Loan`, `LoanItem` mit den Feldern und
Beziehungen aus dem Konzept. Beachte:
- `Article.type` ist ein Enum: `UNIQUE`, `BULK`, `CONSUMABLE`.
- **Zweistufiger Eigentümer:** Jeder `InventoryItem` referenziert `owner_organization_id`
  (Ebene 1) und `owner_unit_id` (Ebene 2). `OrganizationUnit` gehört per Fremdschlüssel zu
  einer `Organization`; sichere per Validierung ab, dass die gewählte Untereinheit zur
  gewählten Organisation gehört. Eigentum sitzt am Einzelstück, nicht am Artikel, und ist
  unabhängig von `location`/`room`.
- **Gruppen:** `UserGroup` hat ein Feld `source` (`churchtools` | `manual`).
- **Jedes physische Objekt ist ein eigener `InventoryItem` — bei allen drei Typen.** Es
  gibt keinen Mengenzähler; auch Mehrfachobjekte (z. B. Kabel) werden als einzelne
  Datensätze geführt und sind einzeln anzeigbar. Jeder `InventoryItem` hat eine eindeutige
  `inventory_number` (bei Bedarf systemgeneriert), einen diskreten `status`, einen
  `location`, einen `room`, optional `serial_number`. `condition_percent` (1–100) gibt es
  nur bei `CONSUMABLE`; sichere das per DB-Constraint/Validierung ab.
- Aggregierte Kennzahlen je Artikel (Gesamtzahl, verfügbar, verliehen) werden **berechnet**,
  nicht gespeichert. Das `/inventory`-Listing muss sowohl eine flache Einzelansicht als auch
  eine nach Artikel gruppierte Ansicht liefern können.
- Jeder `InventoryItem` referenziert genau einen `Location` und einen `Room`.
- `Loan` hat ein Feld `source` (`internal`|`external`) — für die spätere Verleih-Website
  vorbereiten, aber jetzt nur `internal` nutzen.
- Alle Tabellen mit `created_at`/`updated_at`.

**Authentifizierung (drei Methoden, ein Nutzerkonto):**
1. **Lokal**: Benutzername + Passwort (Argon2id-Hash), mit Rate-Limiting.
2. **ChurchTools OAuth2**: Backend als OAuth2-Client, Authorization-Code-Flow mit PKCE.
   Endpunkte zum Starten des Flows und für den Callback; beim ersten Login lokales
   Nutzerkonto anlegen/verknüpfen (Mapping über ChurchTools-Person-ID). Konfiguration über
   `.env` (Basis-URL, clientId, clientSecret, redirectUri, authorizationUrl, tokenUrl,
   profileUrl). **Gruppen-Synchronisation:** Lies die Gruppenmitgliedschaften aus dem
   ChurchTools-Profil (groups claim) und synchronisiere sie bei **jedem** ChurchTools-Login
   in `UserGroup` mit `source = 'churchtools'`: fehlende anlegen, in ChurchTools nicht mehr
   vorhandene entfernen. Einträge mit `source = 'manual'` dürfen dabei **niemals** verändert
   oder entfernt werden. Lege Gruppen, die per `external_ref` noch nicht existieren, an.
3. **Passkey (WebAuthn/FIDO2)**: Registrierungs- und Login-Flow, mehrere Passkeys je Nutzer.

Alle drei Wege münden in dasselbe Nutzerkonto (`AuthIdentity` verknüpft `provider` +
`provider_subject` mit `User`). Nach erfolgreichem Login stellt **immer das Backend** eigene
Tokens aus: kurzlebiges Access-JWT + langlebiges, rotierendes, serverseitig widerrufbares
Refresh-Token. Endpunkte: `login`, `refresh`, `logout`, `me` sowie die ChurchTools- und
Passkey-Flows.

**Autorisierung (RBAC):** Guards/Decorators, die pro Endpunkt Permissions prüfen. Rechte
mindestens: `users.manage`, `permissions.assign`, `roles.manage`, `articles.manage`,
`inventory.manage`, `locations.manage`, `loans.create`, `loans.manage`, `inventory.view`.
Seed eine „Admin"-Rolle mit allen Rechten und einen initialen Admin-Nutzer.

**API-Endpunkte (unter `/api/v1`, mit Pagination/Filter/Sortierung und einheitlichem
Fehlerformat):** Auth (siehe oben); CRUD für `users`, `roles`, `permissions`, `groups`,
`organizations`, `organizations/{id}/units`, `categories`, `articles`, `inventory` (Filter
nach Standort/Raum/Status/Artikel/Eigentümer-Organisation/Untereinheit; Umschalten zwischen
flacher Einzel- und nach Artikel gruppierter Ansicht), `locations`, `rooms`, `loans`;
zusätzlich `users/{id}/groups` (Anzeigen sowie manuelles Zuweisen/Entfernen durch Admins,
immer `source = 'manual'`), `inventory/{id}/movements`, `inventory/{id}/move`,
`articles/{id}/units` (alle Einzelstücke eines Artikels) und `loans/{id}/return`. Eine
Ausleihe referenziert **konkrete Einzel-`InventoryItem`s** (auch bei BULK/CONSUMABLE); die
API muss sowohl das Auswählen bestimmter Inventarnummern als auch „n verfügbare Einheiten
automatisch zuweisen" unterstützen. Bei Ausgabe/Rückgabe den `status` der betroffenen
Einheiten korrekt fortschreiben (und bei CONSUMABLE ggf. `condition_percent` aktualisieren)
sowie `StockMovement`-Einträge erzeugen.

**Qualität:** Generiere OpenAPI/Swagger, ein Seed-Skript mit Beispieldaten (zwei
Organisationen mit je einer Untereinheit, Standorte, Räume, je ein Artikel pro Typ inkl.
passender Bestände mit gesetztem zweistufigem Eigentümer, ein paar Gruppen, Rollen/Rechte,
Admin-Nutzer), Unit- und E2E-Tests für Auth, RBAC, den Gruppen-Sync (inkl. Schutz der
`manual`-Einträge) und die Kern-CRUD-Pfade, sowie eine `README.md` mit Setup-, Migrations-
und Startanleitung.

**Vorgehen:** Beginne mit Projektsetup und Prisma-Schema, dann Migrationen, dann Auth +
RBAC, dann Domänen-CRUD, dann Ausleihe, dann Doku/Seeds/Tests. Halte die Domänenlogik in
Services gekapselt, damit später ein zweiter (öffentlicher) API-Layer für die externe
Verleih-Website dieselbe Logik wiederverwenden kann. Frag nach, falls eine
Konzeptentscheidung mehrdeutig ist.

---
