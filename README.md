# Inventarsystem

Inventar- und Ausleiheverwaltung für Gemeinden/Vereine. Besteht aus zwei eigenständigen
Teilprojekten:

- [`backend/`](backend) – NestJS-API (Auth, RBAC, Inventar, Ausleihe-Workflow, Datei-Uploads,
  Backup, E-Mail-Benachrichtigungen) mit PostgreSQL/Prisma. Siehe [`backend/README.md`](backend/README.md)
  für Details.
- [`frontend/`](frontend) – React-SPA. Siehe [`frontend/README.md`](frontend/README.md) für
  Details.

Grundlage/Konzept: [`Inventarsystem-Konzept.md`](Inventarsystem-Konzept.md).

Dieses Dokument beschreibt, wie man das System betreibt – **mit Docker auf einem beliebigen
Gerät** (empfohlen, auch für Nicht-Entwickler) und alternativ lokal für die Entwicklung.

---

## Installation mit Docker auf einem neuen Gerät

Diese Anleitung richtet sich an alle, die das Inventarsystem auf einem Server, NAS, Mini-PC
oder Laptop **komplett neu einrichten** wollen – ganz ohne Node.js oder sonstige Vorkenntnisse.
Docker kümmert sich um alles: Datenbank, Backend und Frontend laufen jeweils in einem eigenen,
isolierten Container.

Am Ende dieser Anleitung läuft das komplette System und ist unter `http://<Geräte-Adresse>:8080`
erreichbar.

### Überblick: Was wird installiert?

| Container | Aufgabe |
|---|---|
| `postgres` | Datenbank – speichert alle Daten dauerhaft |
| `backend` | NestJS-API – die eigentliche Anwendungslogik |
| `frontend` | Nginx-Webserver – liefert die Weboberfläche aus und leitet API-Anfragen intern an `backend` weiter |

Die Weboberfläche (`frontend`) ist der **einzige** Container, den man von außen aufruft; er
reicht Anfragen an `/api/...` intern an `backend` weiter. Dadurch reicht ein einziger offener
Port (`8080`) für den kompletten Betrieb.

### Schritt 1: Docker installieren

Docker ist die einzige Voraussetzung – Node.js, PostgreSQL o. Ä. müssen **nicht** separat
installiert werden.

- **Windows / macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  herunterladen, installieren und einmal starten.
- **Linux:** [Docker Engine + Compose-Plugin](https://docs.docker.com/engine/install/) gemäß der
  Anleitung für die jeweilige Distribution installieren.

Prüfen, ob die Installation funktioniert hat (Terminal / PowerShell):

```bash
docker --version
docker compose version
```

Beide Befehle sollten eine Versionsnummer ausgeben, keinen Fehler.

### Schritt 2: Projekt auf das Gerät bringen

**Option A – mit Git** (empfohlen, macht spätere Updates einfach):

```bash
git clone <URL-des-Repositories> ejb-inventarsystem
cd ejb-inventarsystem
```

**Option B – als ZIP:** Falls kein Git verfügbar ist, das Projekt als ZIP-Archiv herunterladen,
an gewünschter Stelle entpacken und in einem Terminal in den entpackten Ordner wechseln
(`cd Pfad/zum/Ordner`).

Alle folgenden Befehle werden **im Hauptordner des Projekts** ausgeführt (dort, wo
`docker-compose.yml` liegt).

### Schritt 3: Konfiguration anlegen

Die Anwendung wird über eine einzige Datei `backend/.env` konfiguriert. Zuerst die Vorlage
kopieren:

```bash
cp backend/.env.example backend/.env
```

*(Windows/PowerShell: `Copy-Item backend\.env.example backend\.env`)*

Jetzt `backend/.env` mit einem beliebigen Texteditor öffnen und **mindestens** diese drei Werte
durch eigene, zufällige Zeichenketten ersetzen:

```
JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
BACKUP_SECRET_KEY=change-me-32-char-minimum-secret-key
```

Zufällige Werte lassen sich ganz ohne lokale Node-/OpenSSL-Installation direkt über Docker
erzeugen (Befehl zweimal ausführen, einmal je Secret):

```bash
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Zusätzlich empfiehlt es sich, gleich den initialen Admin-Zugang festzulegen (statt später das
Standardpasswort zu ändern):

```
ADMIN_EMAIL=deine-email@example.com
ADMIN_PASSWORD=ein-sicheres-passwort
```

Alle übrigen Variablen (ChurchTools-Login, Passkeys, OneDrive-Backup) sind optional und können
vorerst unverändert bleiben – siehe [Schritt 7](#schritt-7-zugriff-von-anderen-geräten--eigene-domain)
und die Tabelle am Ende dieses Abschnitts, falls diese Funktionen später gebraucht werden.

### Schritt 4: Container bauen und starten

```bash
docker compose up -d --build
```

Das lädt beim ersten Mal das PostgreSQL-Image herunter und baut die `backend`- und
`frontend`-Images aus dem Quellcode – das kann je nach Internetverbindung und Gerät einige
Minuten dauern. Der Fortschritt wird im Terminal angezeigt.

Prüfen, ob alle drei Container laufen:

```bash
docker compose ps
```

Erwartet werden drei Einträge (`postgres`, `backend`, `frontend`) mit Status `running` bzw.
`healthy`.

### Schritt 5: Datenbank einrichten

Beim allerersten Start ist die Datenbank leer. Einmalig die Tabellenstruktur anlegen und
Grunddaten (Berechtigungen, Rollen, Admin-Konto) einspielen:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed
```

Der Seed legt u. a. an: die Standard-Rollen (`Admin`, `Lagerwart`, `Ausleiher`, `Betrachter`)
sowie ein Admin-Konto mit den in `backend/.env` gesetzten Werten für `ADMIN_EMAIL` /
`ADMIN_PASSWORD` (Standard, falls nicht angepasst: `admin@example.com` / `ChangeMe123!`).

### Schritt 6: Anmelden

Im Browser öffnen:

```
http://localhost:8080
```

*(auf demselben Gerät, auf dem Docker läuft)* und mit dem Admin-Konto aus Schritt 5 anmelden.
Falls das Standardpasswort verwendet wurde, dieses direkt nach dem ersten Login unter **Profil
→ Passwort ändern** ersetzen.

Die Ersteinrichtung ist damit abgeschlossen. Optional in den Einstellungen konfigurieren:
E-Mail-Server (`Einstellungen → E-Mail-Server`) für Benachrichtigungen, Backup-Ziel
(`Einstellungen → Backup`, siehe [Backup & Wiederherstellung](#backup--wiederherstellung)).

### Schritt 7: Zugriff von anderen Geräten / eigene Domain

Standardmäßig ist die Oberfläche unter `http://localhost:8080` nur **auf dem Gerät selbst**
erreichbar, das den Docker-Host stellt. Um von anderen Geräten im selben Netzwerk (Handy, andere
PCs) zuzugreifen:

1. Die lokale IP-Adresse des Docker-Hosts ermitteln (Linux/macOS: `ip a` bzw. `ifconfig`;
   Windows: `ipconfig`), z. B. `192.168.1.50`.
2. Im Netzwerk/der Firewall des Geräts sicherstellen, dass Port `8080` erreichbar ist.
3. Von anderen Geräten im Netzwerk `http://192.168.1.50:8080` aufrufen.

**Wichtiger Hinweis zu Passkeys (WebAuthn) und ChurchTools-Login:** Diese beiden Login-Methoden
sind an eine feste Adresse gebunden. Wird die Anwendung nicht nur über `localhost` genutzt,
müssen folgende Werte in `backend/.env` an die tatsächlich verwendete Adresse angepasst werden,
bevor die Container neu gestartet werden (`docker compose up -d --build`):

| Variable | Anzupassen auf |
|---|---|
| `WEBAUTHN_RP_ID` | Hostname ohne Protokoll/Port, z. B. `inventar.beispiel.de` |
| `WEBAUTHN_ORIGIN` | Vollständige Adresse der Weboberfläche, z. B. `https://inventar.beispiel.de` – wird auch als Basis-URL für Links in E-Mails verwendet (z. B. „Passwort zurücksetzen“) |
| `CHURCHTOOLS_REDIRECT_URI` | `<Adresse-der-Weboberfläche>/auth/churchtools/callback` |
| `MS_REDIRECT_URI` | `<Adresse-der-Weboberfläche>/settings/backup/onedrive/callback` (nur bei OneDrive-Backup) |

Browser verlangen für WebAuthn/Passkeys grundsätzlich **HTTPS** (Ausnahme: `localhost`). Für
einen produktiven Betrieb außerhalb des eigenen Rechners empfiehlt sich daher ein
Reverse-Proxy mit TLS-Zertifikat (z. B. [Caddy](https://caddyserver.com/) oder
[Traefik](https://traefik.io/traefik/)) vor dem `frontend`-Container, der Zertifikate z. B.
automatisch über Let's Encrypt bezieht. `CORS_ORIGIN` muss dafür nicht angepasst werden – der
Browser spricht in dieser Architektur immer nur mit `frontend`, welches `/api`-Aufrufe intern
(serverseitig, ohne CORS) an `backend` weiterreicht.

---

## Alltag mit Docker

```bash
docker compose up -d              # (Neu-)Starten, z. B. nach einem Geräte-Neustart
docker compose ps                 # Status der Container prüfen
docker compose logs -f backend    # Live-Logs ansehen (Strg+C zum Beenden)
docker compose logs -f frontend
docker compose restart backend    # einzelnen Container neu starten
docker compose down               # Stoppen (alle Daten bleiben erhalten)
```

### Aktualisieren (nach Code-Änderungen / neuer Version)

```bash
git pull                                          # neuen Code holen (bei Git-Installation)
docker compose up -d --build                      # Images neu bauen und Container ersetzen
docker compose exec backend npx prisma migrate deploy   # neue Datenbank-Änderungen anwenden
```

Der letzte Befehl ist harmlos, falls es keine neuen Migrationen gibt – Prisma überspringt
bereits angewendete Migrationen automatisch.

### Backup & Wiederherstellung

Die Anwendung bringt eine eingebaute Backup-Funktion mit, die Datenbank **und** hochgeladene
Dateien in einer einzigen Datei sichert:

- Über die Oberfläche: **Einstellungen → Backup** (Berechtigung `settings.manage` nötig) –
  manueller Download, automatisierte Zeitpläne sowie SFTP-/OneDrive-Backup-Ziele.
- Direkt über die API: `GET /api/v1/backup/export` (Download) / `POST /api/v1/backup/import`
  (Wiederherstellung, überschreibt den aktuellen Datenbestand).

Zusätzlich landen alle Daten in zwei benannten Docker-Volumes, die `docker compose down`
überstehen:

| Volume | Inhalt |
|---|---|
| `postgres_data` | die Datenbank |
| `uploads_data` | hochgeladene Dateien (Artikel-/Objekt-Anhänge, Ausleihe-Fotos) |

**Nur `docker compose down -v` (mit `-v`) löscht diese Volumes und damit sämtliche Daten
unwiderruflich** – dieser Befehl sollte nur bewusst verwendet werden (z. B. bei einer
vollständigen Neueinrichtung).

### Deinstallation

Container stoppen und entfernen, Daten aber behalten (z. B. für eine spätere Neuinstallation
oder einen Geräte-Wechsel mit vorherigem Backup):

```bash
docker compose down
```

Container **und** sämtliche Daten unwiderruflich entfernen:

```bash
docker compose down -v
```

Zusätzlich die gebauten Images entfernen (optional, gibt Speicherplatz frei):

```bash
docker compose down -v --rmi all
```

### Fehlerbehebung

| Problem | Lösung |
|---|---|
| `docker compose up` schlägt mit „port is already allocated“ fehl | Ein anderer Dienst belegt bereits Port 8080. In `docker-compose.yml` bei `frontend` → `ports` z. B. `'8081:80'` statt `'8080:80'` eintragen und erneut starten. |
| Seite lädt, aber Login schlägt fehl / „Netzwerkfehler“ | `docker compose ps` prüfen, ob `backend` läuft; `docker compose logs backend` auf Fehler prüfen. Häufigste Ursache: Migrationen aus Schritt 5 wurden nach einem Update nicht erneut ausgeführt. |
| Container `backend` startet nicht, Logs zeigen Prisma-/DB-Fehler | Kurz warten und `docker compose ps` erneut prüfen – `backend` wartet automatisch, bis `postgres` „healthy“ ist. Bleibt der Fehler bestehen: `docker compose logs postgres` prüfen. |
| Passwort vergessen | Neuer Admin-Zugang über: `docker compose exec backend npx prisma db seed` (legt fehlende Rollen/den Admin aus `.env` erneut an, ändert aber ein bereits vorhandenes Passwort nicht) – alternativ das Passwort-Hash-Feld eines Nutzers direkt über einen zweiten Admin-Account in der Oberfläche zurücksetzen lassen. |
| Änderungen an `backend/.env` zeigen keine Wirkung | Nach `.env`-Änderungen die Container neu erstellen: `docker compose up -d --build` (ein reiner `restart` reicht nicht, da Umgebungsvariablen nur beim Container-Erstellen neu eingelesen werden). |
| Passkeys/ChurchTools-Login funktionieren nach Wechsel auf ein anderes Gerät/eine Domain nicht mehr | Siehe [Schritt 7](#schritt-7-zugriff-von-anderen-geräten--eigene-domain) – `WEBAUTHN_*`/`CHURCHTOOLS_REDIRECT_URI`/`MS_REDIRECT_URI` müssen zur tatsächlich aufgerufenen Adresse passen. |

### Wichtige Umgebungsvariablen (`backend/.env`)

| Variable | Zweck |
|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Pflicht, min. 16 Zeichen |
| `BACKUP_SECRET_KEY` | Pflicht, min. 32 Zeichen – verschlüsselt gespeicherte SFTP-/OneDrive-Zugangsdaten sowie das E-Mail-Server-Passwort |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Initialer Admin-Account (beim Seed angelegt) |
| `CHURCHTOOLS_*` | Optional, für ChurchTools-Login |
| `WEBAUTHN_*` | Optional, für Passkey-Login – siehe [Schritt 7](#schritt-7-zugriff-von-anderen-geräten--eigene-domain) |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` / `MS_REDIRECT_URI` | Optional, nur für OneDrive als Backup-Ziel (Azure-App-Registrierung mit `Files.ReadWrite`-Berechtigung nötig). Ohne diese Werte funktioniert die SFTP-Backup-Option uneingeschränkt. |
| `CORS_ORIGIN` | Für den Docker-Betrieb ohne Bedeutung (Browser spricht nur mit `frontend`); nur für die lokale Entwicklung ohne Docker relevant. |

Vollständige Liste inkl. Beschreibung: [`backend/.env.example`](backend/.env.example).

Backend direkt erreichbar machen (z. B. für Swagger unter `/api/v1/docs` ohne Umweg über das
Frontend, oder für externe Integrationen): in `docker-compose.yml` beim `backend`-Service einen
`ports`-Abschnitt ergänzen, z. B. `- '3000:3000'`. Ohne diese Ergänzung ist `backend` – wie
vorgesehen – nur intern für `frontend` erreichbar; Swagger ist auch ohne diese Änderung ganz
normal unter `http://localhost:8080/api/v1/docs` nutzbar, da `frontend` `/api/...`-Aufrufe
weiterleitet.

---

## Alternative: Lokale Entwicklung ohne Docker für die Apps

Für tägliches Entwickeln – Backend und Frontend laufen direkt mit Node, nur Postgres kommt aus
Docker. Beide Server unterstützen Hot-Reload.

### Voraussetzungen

- Node.js ≥ 20
- Docker Desktop (nur für PostgreSQL)

### Einmalige Einrichtung

```bash
# Postgres starten (Backend-eigenes, schlankes Compose-File)
cd backend
docker compose up -d postgres

# Backend
npm install
cp .env.example .env
# in .env mindestens JWT_ACCESS_SECRET, JWT_REFRESH_SECRET und BACKUP_SECRET_KEY setzen
# (z. B. jeweils per: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
npx prisma migrate deploy
npx prisma db seed

# Frontend
cd ../frontend
npm install
```

### Starten

Zwei Terminals:

```bash
# Terminal 1
cd backend
npm run start:dev      # http://localhost:3000/api/v1

# Terminal 2
cd frontend
npm run dev             # http://localhost:5173
```

Das Frontend proxied `/api` automatisch auf `http://localhost:3000` (siehe
`frontend/vite.config.ts`), daher ist keine `.env` im Frontend nötig.

**Login:** `admin@example.com` / `ChangeMe123!` (bzw. die in `backend/.env` gesetzten
`ADMIN_EMAIL`/`ADMIN_PASSWORD`-Werte).

---

## Tests

```bash
cd backend
npm test           # Unit-Tests
npm run test:e2e   # End-to-End-Tests (eigene Test-Datenbank, siehe backend/README.md)

cd ../frontend
npm run build      # TypeScript-Check + Produktions-Build
npm run lint
```
