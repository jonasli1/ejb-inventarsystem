# Inventarsystem – Backend

REST-API für das Inventar- und Lagerverwaltungssystem. Eigenständiges, authentifiziertes
Backend (NestJS + PostgreSQL + Prisma) – kein Server-side Rendering, reines API-Backend für
ein separat entwickeltes Frontend. Grundlage: [`../Inventarsystem-Konzept.md`](../Inventarsystem-Konzept.md).

## Tech-Stack

- **NestJS** (TypeScript) mit modularer Struktur, Guards für Auth/RBAC
- **PostgreSQL** + **Prisma** (Schema, Migrationen, Client)
- **Auth:** JWT (Access + rotierender Refresh-Token), Argon2 (lokale Passwörter),
  ChurchTools OAuth2 (Authorization Code + PKCE), `@simplewebauthn/server` (Passkey/WebAuthn)
- **OpenAPI/Swagger** (automatisch generiert)
- **Jest** (Unit) + **Supertest** (E2E)
- **Docker Compose** für lokale Entwicklung (API + Postgres)

## Voraussetzungen

- Node.js ≥ 20
- Docker Desktop (für PostgreSQL; alternativ eine eigene Postgres-Instanz)

## Setup

```bash
npm install
cp .env.example .env
```

Trage in `.env` mindestens eigene Werte für `JWT_ACCESS_SECRET` und `JWT_REFRESH_SECRET` ein
(z. B. `openssl rand -hex 32`). Die übrigen Variablen sind für die lokale Entwicklung mit
Docker Compose bereits sinnvoll vorbelegt. `CHURCHTOOLS_*` und `WEBAUTHN_*` können für die
ersten Tests auf den Platzhalterwerten bleiben – ChurchTools-Login und Passkeys funktionieren
dann erst, wenn eine echte ChurchTools-Instanz bzw. eine Browser-Origin für WebAuthn
konfiguriert ist.

### Datenbank starten

```bash
docker compose up -d postgres
```

### Migrationen ausführen

```bash
npx prisma migrate deploy   # oder: npx prisma migrate dev (bei Schema-Änderungen)
```

### Seed-Daten einspielen

```bash
npx prisma db seed
```

Legt an: Permissions + Rollen (`Admin`, `Lagerwart`, `Ausleiher`, `Betrachter`), zwei
Organisationen mit je einer Untereinheit, zwei Standorte mit Räumen, je einen Artikel pro Typ
(`UNIQUE`/`BULK`/`CONSUMABLE`) inkl. Bestand mit gesetztem zweistufigem Eigentümer, ein paar
Gruppen sowie einen Admin-Benutzer.

Admin-Zugangsdaten (aus `.env`, standardmäßig):

```
E-Mail:    admin@example.com
Passwort:  ChangeMe123!
```

**Wichtig:** Passwort nach dem ersten Login in einer produktiven Umgebung ändern bzw. vor dem
Deployment eigene `ADMIN_EMAIL`/`ADMIN_PASSWORD`-Werte in `.env` setzen.

### Anwendung starten

```bash
npm run start:dev     # Watch-Modus
# oder
npm run start          # einmaliger Start
# oder
npm run build && npm run start:prod
```

Die API läuft anschließend unter `http://localhost:3000/api/v1`, die OpenAPI/Swagger-Doku
unter `http://localhost:3000/api/v1/docs`.

### Alles über Docker Compose (nur Backend, lokale Entwicklung)

```bash
docker compose up -d --build
```

Startet Postgres und die API zusammen (dieses `docker-compose.yml` liegt in `backend/`).
Migrationen/Seed müssen weiterhin separat ausgeführt werden (z. B. per
`docker compose exec api npx prisma migrate deploy`). Für ein produktionsnahes Gesamt-Deployment
(Frontend + Backend + Postgres als drei Container) siehe das `docker-compose.yml` im
Repository-Root sowie den Abschnitt „Deployment“ weiter unten.

## Deployment (Gesamtsystem)

Das Root-`docker-compose.yml` baut drei Container: `postgres`, `backend` (dieses Verzeichnis,
inkl. `pg_dump`/`pg_restore` für die Backup-Funktion) und `frontend` (Nginx, liefert die
gebaute SPA aus und reverse-proxied `/api` an `backend` – dadurch entfällt CORS in Produktion).

```bash
cp backend/.env.example backend/.env   # eigene Secrets eintragen, siehe oben
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed   # optional, für Beispieldaten
```

Danach ist das Frontend unter `http://localhost:8080` erreichbar, sowie per HTTPS (selbstsigniertes
Zertifikat, automatisch erzeugt) unter `https://localhost:8443` – siehe „HTTPS aktivieren“ im
Root-`README.md` für ein echtes Zertifikat. Der Backend-Container erhält
ein benanntes Volume (`uploads_data`) für hochgeladene Dateien (Artikel-/Objekt-Anhänge,
Ausleihe-Fotos) – dieses Verzeichnis muss beim Backup mit gesichert werden (die eingebaute
Backup-Funktion unter „Backup“ im Frontend tut das automatisch).

Neue, für den produktiven Betrieb relevante Umgebungsvariablen: `UPLOADS_DIR` (Pfad für Datei-
Uploads, im Container bereits auf `/app/uploads` gesetzt), `BACKUP_SECRET_KEY` (Pflichtfeld,
verschlüsselt gespeicherte SFTP-/OneDrive-Zugangsdaten – min. 32 Zeichen, z. B. per
`openssl rand -hex 32` erzeugen), sowie optional `MS_CLIENT_ID`/`MS_CLIENT_SECRET`/`MS_TENANT_ID`/
`MS_REDIRECT_URI` für die OneDrive-Backup-Anbindung (Azure-App-Registrierung mit delegierter
`Files.ReadWrite`-Berechtigung erforderlich; ohne diese Werte funktioniert die SFTP-Backup-Option
weiterhin uneingeschränkt).

## Tests

Für E2E-Tests wird eine **separate** Test-Datenbank verwendet (Konfiguration in `.env.test`),
damit Testläufe die Entwicklungsdaten nicht anfassen.

```bash
# einmalig: Test-Datenbank anlegen und migrieren
docker exec <postgres-container> createdb -U inventarsystem inventarsystem_test
set -a && source .env.test && set +a && npx prisma migrate deploy

# Unit-Tests
npm run test

# E2E-Tests (Auth, RBAC, ChurchTools-Gruppen-Sync, Kern-CRUD, Ausleihe-Lifecycle)
npm run test:e2e

# Testabdeckung
npm run test:cov
```

## Projektstruktur

```
prisma/
  schema.prisma       Datenmodell (alle Entitäten aus dem Konzept)
  migrations/          SQL-Migrationen
  seed.ts               Seed-Skript mit Beispieldaten
src/
  auth/                 Login (lokal/ChurchTools/Passkey), JWT, RBAC-Grundlagen
  users/ roles/ permissions/ groups/   Benutzerverwaltung & RBAC
  organizations/ organization-units/    Zweistufiger Eigentümer
  categories/ articles/                 Katalog
  locations/ rooms/                     Lagerstruktur
  inventory/                            Bestand (Einzel- & Gruppenansicht, Bewegungen, Umlagerung)
  loans/                     Ausleihe-Workflow (beantragt → genehmigt → herausgegeben → abgeschlossen),
                              organisationsbezogene Genehmigung, Kalender-Endpoint
  attachments/                Datei-Uploads für Artikel/Objekte/Ausleihen (Bilder, Dokumente, Prüfdokumente)
  backup/                     Backup/Restore (pg_dump/pg_restore) + zeitgesteuerter SFTP-/OneDrive-Export
  activity/ export/                     Aktivitäten-Feed, Excel/PDF-Export
  common/                                Guards, Decorators, Pagination, Fehlerformat
test/
  app.e2e-spec.ts        End-to-End-Tests gegen eine echte Test-Datenbank
```

## Authentifizierung

Alle drei Login-Wege (lokal, ChurchTools OAuth2, Passkey) münden im selben Nutzerkonto
(`AuthIdentity` verknüpft `provider` + `provider_subject` mit `User`). Nach erfolgreichem
Login stellt ausschließlich das Backend eigene Tokens aus:

- **Access-Token** (JWT, standardmäßig 15 Minuten)
- **Refresh-Token** (opak, rotierend, serverseitig widerrufbar, standardmäßig 30 Tage)

Wichtige Endpunkte: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`GET /auth/me`, `GET /auth/churchtools/start`, `GET /auth/churchtools/callback`,
`POST /auth/passkey/register/options`, `POST /auth/passkey/register/verify`,
`POST /auth/passkey/login/options`, `POST /auth/passkey/login/verify`.

`/auth/login`, `/auth/refresh` und `/auth/passkey/login/verify` sind zusätzlich strenger
rate-limitiert (`THROTTLE_AUTH_LIMIT`/`THROTTLE_AUTH_TTL` in `.env`) als der API-weite
Standard-Limiter (`THROTTLE_LIMIT`/`THROTTLE_TTL`).

### ChurchTools-Gruppen-Sync

Gruppenmitgliedschaften mit `source = churchtools` werden bei **jedem** ChurchTools-Login
synchronisiert (hinzufügen/entfernen). Mitgliedschaften mit `source = manual` – zugewiesen über
`POST /users/{id}/groups` – bleiben davon unberührt. Siehe Abschnitt 3.4 des Konzepts sowie den
E2E-Test `ChurchTools group sync` in `test/app.e2e-spec.ts`.

## Rechtesystem (RBAC)

Guards (`JwtAuthGuard`, `PermissionsGuard`) prüfen pro Endpunkt die im Access-Token referenzierten
Rollen/Permissions des Nutzers (`@RequirePermissions(...)`-Decorator). Verfügbare Permissions:
siehe `src/common/constants/permissions.ts`. Endpunkte ohne `@Public()` erfordern grundsätzlich
ein gültiges Access-Token.

## API-Dokumentation

Vollständige, interaktive OpenAPI/Swagger-Doku unter `/api/v1/docs`, sobald die Anwendung
läuft.
