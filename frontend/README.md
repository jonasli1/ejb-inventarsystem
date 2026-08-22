# Inventarsystem – Frontend

Responsive Single-Page-Application für das Inventar- und Lagerverwaltungssystem. Reiner
API-Client für das [Backend](../backend) – kein Server-side Rendering, keine Kopplung
über gemeinsamen Code. Grundlage: [`../Inventarsystem-Konzept.md`](../Inventarsystem-Konzept.md).

## Tech-Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4** für ein schlankes, konsistentes Design-System
- **React Router** für Routing inkl. geschützter/berechtigungsabhängiger Routen
- **TanStack Query** für Server-State (Caching, Invalidierung, Pagination)
- **react-hook-form** + **zod** für Formulare/Validierung
- **@simplewebauthn/browser** für Passkey-Registrierung/-Login
- **axios** mit Interceptors für Access-/Refresh-Token-Handling

## Setup

```bash
npm install
```

In der lokalen Entwicklung ist keine `.env` nötig: `vite.config.ts` proxyt `/api` auf
`http://localhost:3000` (das Backend), wodurch CORS-Themen im Dev-Betrieb entfallen. Für
einen Produktions-Build gegen ein separat gehostetes Backend kann `VITE_API_URL` gesetzt
werden (siehe `.env.example`).

### Entwicklung

```bash
npm run dev
```

Läuft unter `http://localhost:5173`. Das [Backend](../backend) muss parallel laufen
(`npm run start:dev` im `backend`-Ordner, inkl. Postgres via `docker compose up -d postgres`
und eingespielten Migrationen/Seed-Daten).

### Build

```bash
npm run build     # tsc -b && vite build
npm run preview   # Production-Build lokal ansehen
```

### Lint

```bash
npm run lint
```

### Docker / Deployment

`Dockerfile` baut die SPA (`vite build`) und liefert sie über Nginx aus (`nginx.conf`), das
zusätzlich `/api` an einen `backend`-Container reverse-proxied (kein CORS-Setup in Produktion
nötig). Für ein vollständiges Setup (Postgres + Backend + Frontend) siehe das
`docker-compose.yml` im Repository-Root sowie den Deployment-Abschnitt in
[`../backend/README.md`](../backend/README.md).

## Login-Konfiguration

Damit ChurchTools-Login und Passkey funktionieren, müssen im Backend passende Werte gesetzt
sein (`backend/.env`):

- `CHURCHTOOLS_REDIRECT_URI` muss auf die Frontend-Route
  `http://localhost:5173/auth/churchtools/callback` zeigen. Diese Seite
  (`src/features/auth/ChurchToolsCallbackPage.tsx`) liest `code`/`state` aus der URL und
  reicht sie an den Backend-Endpunkt `GET /auth/churchtools/callback` weiter, der den
  eigentlichen Token-Austausch mit ChurchTools durchführt.
- `WEBAUTHN_ORIGIN` muss der Origin sein, unter der das Frontend läuft
  (`http://localhost:5173` in der lokalen Entwicklung).

Ohne eine echte ChurchTools-Instanz lässt sich der ChurchTools-Login nur bis zum
Redirect zu ChurchTools nachvollziehen (Start-Flow inkl. PKCE); der vollständige Round-Trip
erfordert eine erreichbare ChurchTools-Instanz mit passender OAuth2-Client-Registrierung.

## Projektstruktur

```
src/
  auth/                Auth-Context, geschützte Routen, Berechtigungs-Gate
  components/
    ui/                 Wiederverwendbare Grundbausteine (Button, Input, Modal, Badge, …)
    layout/              App-Shell (responsive Sidebar/Topbar), Navigation, PageHeader
  features/
    auth/                 Login (lokal/ChurchTools/Passkey), Callback-Relay
    dashboard/             Übersicht mit Kennzahlen
    inventory/              Bestand: Einzel-/Gruppenansicht, Bewegungen, Umlagerung
    articles/                Artikelkatalog + Kategorien
    locations/                Standorte + Räume
    organizations/             Organisationen + Untereinheiten (zweistufiger Eigentümer)
    loans/                      Ausleihe-Workflow (beantragen/genehmigen/ausgeben/zurückgeben),
                                  Bearbeiten, Zustandsfotos
    calendar/                     Kalenderansicht aller Ausleihen
    settings/                      Backup: manuell (Download/Upload) + zeitgesteuert (SFTP/OneDrive)
    users/ roles/ groups/        Benutzerverwaltung, RBAC, Gruppen (inkl. Organisationszuordnung)
    profile/                      Kontoinformationen, Passkey-Verwaltung
  lib/                  API-Client (axios + Token-Refresh), gemeinsame Typen, Referenzdaten-Hooks
```

## Berechtigungen (RBAC)

Die Navigation und einzelne Aktionen blenden sich abhängig von den Permissions aus
`GET /auth/me` ein-/aus (`src/auth/PermissionGate.tsx`,
`src/components/layout/nav-config.ts`). Das ist eine reine UX-Maßnahme – die verbindliche
Durchsetzung der Rechte erfolgt serverseitig im Backend; das Frontend blendet lediglich
aus, was ohnehin am Backend abgelehnt würde.

## Getestet gegen das Backend

Login (lokal), Navigation, Berechtigungs-Gating, sowie der vollständige Ablauf
Organisation → Untereinheit → Standort → Raum → Artikel → Inventarobjekt → Ausleihe →
Rückgabe wurden über die UI end-to-end gegen das laufende Backend verifiziert.
