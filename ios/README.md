# Inventarsystem – iOS-App

Native iOS-App (Swift/SwiftUI) für das [Inventarsystem](../README.md) – funktional gleichwertig
zur [`frontend/`](../frontend)-Web-Oberfläche, plus eine zusätzliche, rein auf dem Gerät
laufende Kamera-Erkennung von Inventar-Aufklebern. Spricht ausschließlich die bestehende
[`backend/`](../backend)-REST-API an; **am Backend wurde nichts geändert** – fehlende
API-Funktionalität ist am Ende dieses Dokuments als Empfehlung aufgeführt, statt sie einseitig
nachzurüsten.

## Überblick

- Swift + SwiftUI, iOS 18+, MVVM (`@Observable`-ViewModels), keine Drittanbieter-Abhängigkeiten
  (kein SPM-Paket, kein CocoaPods) – alles über Systemframeworks.
- Alle drei Anmeldemethoden des Backends: lokal (E-Mail/Passwort), ChurchTools-OAuth2
  (`ASWebAuthenticationSession`), Passkey (`AuthenticationServices`/WebAuthn).
- Volle Funktionsparität zum Frontend: Dashboard, Inventar (Einzeln/Gruppiert, Zubehör,
  Dokumente, Bewegungshistorie, Ausmustern), Artikel-Katalog, Standorte/Räume,
  Organisationen/Untereinheiten, Ausleihe (inkl. Vorlagen, Sperrzeiten, Kalender),
  Aktivitäten/Audit, Benutzer/Rollen/Gruppen, Profil (inkl. Benachrichtigungseinstellungen),
  Einstellungen (Allgemein, E-Mail, Backup).
- Zusätzliches, iOS-exklusives Kernfeature: On-Device-Erkennung von Inventar-Aufklebernummern per
  Kamera (Vision-Framework, keine Cloud), mit konfigurierbaren **Sticker-Profilen** – siehe
  [Sticker-Erkennung](#sticker-erkennung-kamera-scan).
- Server-Adresse ist nicht fest einprogrammiert – wird bei der Ersteinrichtung abgefragt und
  validiert, später in den Einstellungen änderbar.
- Zugriffs-/Refresh-Token liegen ausschließlich im Schlüsselbund (Keychain), niemals in
  `UserDefaults`.
- Performance auf sehr große Bestände ausgelegt: ausschließlich serverseitige Pagination/Suche,
  keine Volltabellen-Ladevorgänge; Bilder als Vorschau in Listen, volle Auflösung nur in der
  Detailansicht; Dokumente werden erst bei Bedarf heruntergeladen.

## Voraussetzungen

- macOS mit **Xcode 16 oder neuer** (iOS-18-SDK).
- Ein erreichbares Inventarsystem-Backend – entweder die bestehende Installation (siehe
  [Hauptverzeichnis-README](../README.md)) oder ein lokaler Testserver (siehe unten).
- Für Passkey/ChurchTools-Login auf einem echten Gerät zusätzlich die in
  [Bekannte Einschränkungen](#bekannte-einschränkungen--empfohlene-backend-ergänzungen)
  beschriebene Domain-Konfiguration.

## Projekt öffnen und starten

```bash
open ios/Inventarsystem/Inventarsystem.xcodeproj
```

Schema **Inventarsystem** auswählen, einen Simulator oder ein Gerät wählen, `Cmd+R`. Die App
startet ohne hinterlegte Server-Adresse – siehe nächster Abschnitt.

### Backend zum Testen bereitstellen

Am schnellsten mit der bestehenden Docker-Compose-Konfiguration im Hauptverzeichnis (siehe
[Haupt-README](../README.md#installation-mit-docker-auf-einem-neuen-gerät)); die App im
Simulator erreicht ein auf dem Mac laufendes Backend unter `http://localhost:<Port>` direkt (der
Simulator teilt sich das Netzwerk des Mac). Auf einem echten Gerät muss stattdessen die
lokale Netzwerkadresse des Macs verwendet werden (z. B. `http://192.168.1.50:8080`), da das
Gerät `localhost` sonst als sich selbst interpretiert.

## Server-Adresse konfigurieren

Bei jedem ersten Start fragt die App nach der Server-Adresse (z. B. `https://ejb.lindner.app`
oder `http://192.168.1.50:8080`), prüft das Format und führt einen kurzen Erreichbarkeits-Check
(`GET /api/v1/health`) durch – bei Fehlern erscheint eine deutschsprachige Fehlermeldung statt
eines stillen Fehlschlags. Die Adresse liegt anschließend in `UserDefaults` (keine geheime
Information); danach folgt der normale Login.

Später lässt sie sich unter **Einstellungen → Server-Adresse ändern** anpassen. Ein Wechsel
verwirft die gespeicherten Tokens automatisch – erneute Anmeldung ist dann erforderlich, da Tokens
an eine bestimmte Backend-Instanz gebunden sind.

## Architektur

```
Inventarsystem/
  App/            Einstiegspunkt, RootView (Onboarding/Login/App-Shell), AppShellView
                  (adaptive Navigation: TabBar+„Mehr" auf iPhone, Sidebar auf iPad/Mac)
  Core/
    Networking/   APIClient (URLSession/async-await), APIError (deutsche Backend-Fehlermeldungen),
                  Pagination, Bild-Cache
    Auth/         AuthSession, Keychain-Speicher, Token-Refresh, die drei Login-Coordinators
    Models/       Ein Codable-Typ pro Backend-Entität
    DesignSystem/ Farben (an das Frontend angelehnt), StatusBadges, gemeinsame UI-Bausteine
  OCR/            Sticker-Erkennung (siehe unten) – ProfileMatching (reine Logik, ohne
                  Vision/UIKit) und Vision (Kamera/Foto, RecognizeTextRequest)
  Features/       Ein Ordner je Bereich (Inventory, Articles, Locations, Organizations, Loans,
                  Activity, Users, Roles, Groups, Profile, Settings, Dashboard, Onboarding, Auth),
                  jeweils mit Services/ (API-Zugriff), ViewModels/, Views/
InventarsystemTests/     Unit-Tests (Swift-Testing-Framework), rein gegen URLProtocol-Stubs –
                         laufen ohne echtes Backend
InventarsystemUITests/   XCUITest; ein voller End-to-End-Test (Onboarding → Login → Inventar
                         durchsuchen/bearbeiten → Logout) benötigt einen echten Testserver
                         (siehe unten)
```

## Sticker-Erkennung (Kamera-Scan)

Kernfunktion ohne Frontend-Äquivalent: Neben jedem Suchfeld für Inventarnummern ermöglicht ein
Kamera-Symbol, die Nummer direkt von einem Aufkleber-Foto zu übernehmen – vollständig auf dem
Gerät (Vision-Framework, `RecognizeTextRequest`), ohne Cloud-Dienst.

Die Erkennung ist nicht auf einen Aufkleber-Typ festgelegt, sondern über **Sticker-Profile**
konfigurierbar (**Einstellungen → Sticker-Profile**): Jedes Profil hat einen Präfix, ein
Trennzeichen, Ankerbegriffe (zur Erkennung, welches Profil zu einem Foto passt),
Erkennungsmuster (reguläre Ausdrücke, in Reihenfolge geprüft) und Ausschlussmuster (z. B. für
Modellbezeichnungen in der Nähe der eigentlichen Nummer). Ein Standardprofil „EJB Standard" ist
vorkonfiguriert. Neue/angepasste Profile lassen sich direkt mit Beispielfotos kalibrieren: Foto
hinzufügen, erkannten Text und daraus abgeleitete Kandidaten-Nummer(n) sofort sehen, Muster
anpassen, bis das Ergebnis stimmt – die App zeigt bei mehreren passenden Kandidaten immer eine
Auswahl zur Bestätigung, nie eine automatische, unbestätigte Übernahme.

**Hinweis zu den Testfotos:** Die im ursprünglichen Auftrag beschriebenen 7 Referenzfotos der
echten EjB-Aufkleber lagen auf diesem Rechner nicht vor (wurde ausführlich geprüft – Projekt,
Downloads, Schreibtisch). Die Erkennungslogik selbst ist deshalb gegen alle 7 dokumentierten
Fälle als **reine Text-Logik-Tests** abgesichert (`StickerProfileMatcherTests` – feste
OCR-Zeilen als Eingabe, kein Bild nötig) plus einer separaten Kamera-Pipeline-Smoke-Test-Suite
mit synthetisch erzeugten Testbildern (`StickerVisionPipelineSmokeTests`). Sobald die echten
Fotos verfügbar sind, können sie unter `InventarsystemTests/Fixtures/StickerImages/` ergänzt
werden – die Test-Suite ist so aufgebaut, dass fehlende Bilddateien übersprungen statt als
Fehler gewertet werden.

## Tests ausführen

```bash
cd ios/Inventarsystem

# Unit-Tests (Netzwerk komplett gemockt, kein Backend nötig)
xcodebuild test -project Inventarsystem.xcodeproj -scheme Inventarsystem \
  -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:InventarsystemTests
```

Die End-to-End-UI-Tests (`InventarsystemUITests`) brauchen einen echten, erreichbaren Testserver
und drei Umgebungsvariablen (`UITEST_BASE_URL`, `UITEST_ADMIN_EMAIL`, `UITEST_ADMIN_PASSWORD`) –
ohne diese überspringen sie sich selbst (`XCTSkip`), statt fehlzuschlagen. Da Xcode
Umgebungsvariablen für UI-Test-Ziele nicht zuverlässig über `xcodebuild test` durchreicht, müssen
sie direkt in die generierte `.xctestrun`-Datei geschrieben werden:

```bash
xcodebuild build-for-testing -project Inventarsystem.xcodeproj -scheme Inventarsystem \
  -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath /tmp/ios-uitest-dd

XCTESTRUN=$(find /tmp/ios-uitest-dd -name "*.xctestrun")
python3 - "$XCTESTRUN" <<'EOF'
import plistlib, sys
path = sys.argv[1]
with open(path, "rb") as f:
    data = plistlib.load(f)
for config in data["TestConfigurations"]:
    for target in config["TestTargets"]:
        target.setdefault("EnvironmentVariables", {}).update({
            "UITEST_BASE_URL": "http://localhost:18080",
            "UITEST_ADMIN_EMAIL": "admin@example.com",
            "UITEST_ADMIN_PASSWORD": "<dein-test-passwort>",
        })
with open(path, "wb") as f:
    plistlib.dump(data, f)
EOF

xcodebuild test-without-building -xctestrun "$XCTESTRUN" \
  -destination 'platform=iOS Simulator,name=iPhone 16' -parallel-testing-enabled NO
```

`-parallel-testing-enabled NO` ist wichtig – die standardmäßige Simulator-Klonierung für
parallele Testläufe führt in diesem Setup zu Start-Fehlern.

**Wichtig:** Für den Testlauf niemals die produktiv laufende Docker-Umgebung verwenden – dafür
eine eigene, isolierte Compose-Instanz auf anderen Ports starten (eigener `-p`-Projektname,
eigenes Postgres-Volume), z. B.:

```bash
docker compose -p inv-ios-verify -f docker-compose.yml \
  -f <eigene-override-datei-mit-anderem-port> up -d --build
```

## Bekannte Einschränkungen & empfohlene Backend-Ergänzungen

Passkey- und ChurchTools-Login sind vollständig implementiert und gegen die echten
Apple-Framework-Header sowie den tatsächlichen Backend-Vertrag geprüft, konnten in dieser
Umgebung aber **nicht Ende-zu-Ende auf einem echten Gerät verifiziert werden** (kein physisches
Testgerät, kein Zugriff auf DNS/Zertifikat der echten Domain). Der lokale Login-Weg trägt daher
das Gewicht der tatsächlich durchgeführten End-to-End-Verifikation.

Für den produktiven Einsatz von Passkey/ChurchTools auf dem Gerät sind folgende
Backend-/Infrastruktur-Ergänzungen nötig (keine davon wurde vorgenommen, da das Backend laut
Auftrag nicht verändert werden soll):

1. **`/.well-known/apple-app-site-association`** muss auf der echten Domain (`ejb.lindner.app`,
   aus `caddy/Caddyfile` ermittelt) ausgeliefert werden und die App (Team-ID + Bundle-ID
   `app.lindner.Inventarsystem`) unter `webcredentials` listen – sowohl für nativen Passkey
   (`ASAuthorizationPlatformPublicKeyCredentialProvider`) als auch für den
   ChurchTools-OAuth-Callback (`ASWebAuthenticationSession` mit `.https()`-Callback-Matching)
   nötig. Beide Mechanismen teilen sich diese eine Anforderung.
2. **`backend/.env`**: `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` und `CHURCHTOOLS_REDIRECT_URI` müssen
   von den aktuellen `localhost`-Entwicklungswerten auf die echte Domain umgestellt werden, bevor
   diese beiden Login-Methoden auf einem echten Gerät funktionieren.
3. **Keine Backend-Route zum Auflisten/Entfernen einzelner registrierter Passkeys** – beim Bau
   des Profil-Bereichs festgestellt: `POST /auth/passkey/register/*` legt neue Passkeys an, aber
   es gibt keinen `GET`/`DELETE`-Endpunkt, um bereits registrierte Passkeys eines Kontos
   einzusehen oder zu widerrufen (weder in der App noch im Frontend selbst vorhanden). Für ein
   vollständiges Sicherheits-Self-Service wäre das sinnvoll nachzurüsten.
4. Erwägenswert: das generierte OpenAPI-JSON (`GET /api/v1/docs-json`) im Repository versionieren,
   damit Client-Arbeit künftig gegen einen fixierten Vertrag statt gegen einen laufenden Server
   abgeglichen werden kann.

Weitere kleinere, rein clientseitige Einschränkung: Das automatische „Mehr"-Tab von SwiftUI/UIKit
(erscheint, sobald mehr als 4 Tabs sichtbar sind – hier ab „Ausleihe") übernimmt sein Label
(„More") von der System-/Simulator-Sprache, nicht von der App-eigenen deutschen Lokalisierung, da
es sich um ein vom Betriebssystem automatisch erzeugtes Element handelt. Auf einem Gerät mit
Deutsch als Systemsprache zeigt es korrekt „Mehr" an.
