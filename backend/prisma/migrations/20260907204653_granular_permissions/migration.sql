-- Overhauls the permission system from ~11 coarse "*.manage" grants to
-- ~41 granular resource x action permissions (see
-- src/common/constants/permissions.ts, which is the source of truth this
-- migration mirrors). Every existing role keeps equivalent access - no role
-- loses anything a user could do before this migration.
--
-- NOTE: the "DROP INDEX articles_name_trgm_idx" that `prisma migrate diff`
-- suggests here is a false positive (Prisma doesn't know about that
-- hand-added index from the previous migration) and is intentionally NOT
-- included below.

ALTER TABLE "permissions" ADD COLUMN "display_name" TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- 1. Give existing, unchanged-key permissions their German display name.
-- ---------------------------------------------------------------------------
UPDATE "permissions" SET "display_name" = 'Ausleihen anlegen', "description" = 'Ausleihen für Objekte jeder Organisation beantragen (keine fest installierten Objekte).' WHERE "key" = 'loans.create';
UPDATE "permissions" SET "display_name" = 'Ausleihen verwalten', "description" = 'Ausleihen für Organisationen/Bereiche, denen die eigenen Gruppen zugeordnet sind, genehmigen und direkt anlegen (Ausgabe/Rücknahme erfordert zusätzlich "Ausleihen ausgeben/zurücknehmen").' WHERE "key" = 'loans.manage';
UPDATE "permissions" SET "display_name" = 'Ausleihen ausgeben/zurücknehmen', "description" = 'Objekte für jede Organisation ausgeben (verleihen) und zurücknehmen, unabhängig von "Ausleihen verwalten".' WHERE "key" = 'loans.spend';
UPDATE "permissions" SET "display_name" = 'Ausleihen vollständig verwalten', "description" = 'Ausleihen für jede Organisation genehmigen, ausgeben, zurücknehmen und direkt anlegen.' WHERE "key" = 'loans.administer';
UPDATE "permissions" SET "display_name" = 'Passwort zurücksetzen', "description" = 'Das Passwort einer anderen Person zurücksetzen.' WHERE "key" = 'users.reset_password';
UPDATE "permissions" SET "display_name" = 'E-Mail-Adresse ändern', "description" = 'Die E-Mail-Adresse einer anderen Person ändern.' WHERE "key" = 'users.change_email';
UPDATE "permissions" SET "display_name" = 'Berechtigungen zuweisen', "description" = 'Berechtigungen einer Rolle zuweisen oder entziehen.' WHERE "key" = 'permissions.assign';
UPDATE "permissions" SET "display_name" = 'Einstellungen verwalten', "description" = 'Systemeinstellungen, E-Mail-Server sowie Backups konfigurieren und ausführen.' WHERE "key" = 'settings.manage';
UPDATE "permissions" SET "display_name" = 'Berichte ansehen', "description" = 'Berichte und Exporte (PDF/Excel) einsehen.' WHERE "key" = 'reports.view';

-- ---------------------------------------------------------------------------
-- 2. Pure renames (role_permissions rows are preserved automatically, since
--    this only changes the permission row's key text, not its id/row).
-- ---------------------------------------------------------------------------
UPDATE "permissions" SET "key" = 'loans.read', "display_name" = 'Ausleihen ansehen', "description" = 'Ausleihen nur lesend ansehen, ohne sie zurückzunehmen oder zu verwalten.' WHERE "key" = 'loans.view';
UPDATE "permissions" SET "key" = 'inventory.change_inventory_number', "display_name" = 'Inventarnummer ändern', "description" = 'Die Inventarnummer eines Inventarobjekts ändern, unabhängig von "Inventarobjekte bearbeiten".' WHERE "key" = 'inventory.change_inv_num';

-- ---------------------------------------------------------------------------
-- 3. New permission keys (skip any that a rename above already created).
-- ---------------------------------------------------------------------------
INSERT INTO "permissions" ("id", "key", "display_name", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'articles.read', 'Artikel ansehen', 'Artikel und Kategorien ansehen und durchsuchen.', now(), now()),
  (gen_random_uuid(), 'articles.create', 'Artikel anlegen', 'Neue Artikel und Kategorien anlegen.', now(), now()),
  (gen_random_uuid(), 'articles.update', 'Artikel bearbeiten', 'Bestehende Artikel und Kategorien bearbeiten.', now(), now()),
  (gen_random_uuid(), 'articles.delete', 'Artikel löschen', 'Artikel und Kategorien löschen.', now(), now()),

  (gen_random_uuid(), 'inventory.read', 'Inventarobjekte ansehen', 'Inventarobjekte, ihre Bewegungshistorie und Zubehör-Zuordnungen ansehen.', now(), now()),
  (gen_random_uuid(), 'inventory.create', 'Inventarobjekte anlegen', 'Neue Inventarobjekte anlegen.', now(), now()),
  (gen_random_uuid(), 'inventory.update', 'Inventarobjekte bearbeiten', 'Inventarobjekte bearbeiten, verschieben und Zubehör zuordnen (Ausmustern erfordert zusätzlich "Inventarobjekte ausmustern", Ändern der Inventarnummer zusätzlich "Inventarnummer ändern").', now(), now()),
  (gen_random_uuid(), 'inventory.delete', 'Inventarobjekte löschen', 'Inventarobjekte endgültig aus der Verwaltung entfernen.', now(), now()),
  (gen_random_uuid(), 'inventory.retire', 'Inventarobjekte ausmustern', 'Den Status eines Inventarobjekts auf "ausgemustert" setzen, unabhängig von "Inventarobjekte löschen".', now(), now()),

  (gen_random_uuid(), 'loans.delete', 'Ausleihen löschen', 'Ausleihen unwiderruflich aus der Datenbank löschen (nicht nur ausblenden).', now(), now()),

  (gen_random_uuid(), 'locations.read', 'Standorte ansehen', 'Standorte und Räume ansehen.', now(), now()),
  (gen_random_uuid(), 'locations.create', 'Standorte anlegen', 'Neue Standorte und Räume anlegen.', now(), now()),
  (gen_random_uuid(), 'locations.update', 'Standorte bearbeiten', 'Standorte und Räume bearbeiten.', now(), now()),
  (gen_random_uuid(), 'locations.delete', 'Standorte löschen', 'Standorte und Räume löschen.', now(), now()),

  (gen_random_uuid(), 'organizations.read', 'Organisationen ansehen', 'Organisationen und ihre Bereiche ansehen.', now(), now()),
  (gen_random_uuid(), 'organizations.create', 'Organisationen anlegen', 'Neue Organisationen und Bereiche anlegen.', now(), now()),
  (gen_random_uuid(), 'organizations.update', 'Organisationen bearbeiten', 'Organisationen und ihre Bereiche bearbeiten.', now(), now()),
  (gen_random_uuid(), 'organizations.delete', 'Organisationen löschen', 'Organisationen und ihre Bereiche löschen.', now(), now()),

  (gen_random_uuid(), 'users.read', 'Personen ansehen', 'Benutzerkonten ansehen.', now(), now()),
  (gen_random_uuid(), 'users.create', 'Personen anlegen', 'Neue Benutzerkonten anlegen.', now(), now()),
  (gen_random_uuid(), 'users.update', 'Personen bearbeiten', 'Benutzerkonten bearbeiten sowie Rollen- und Gruppenzuordnungen ändern.', now(), now()),
  (gen_random_uuid(), 'users.delete', 'Personen löschen', 'Benutzerkonten löschen.', now(), now()),

  (gen_random_uuid(), 'roles.read', 'Rollen ansehen', 'Rollen und ihre zugewiesenen Berechtigungen ansehen.', now(), now()),
  (gen_random_uuid(), 'roles.create', 'Rollen anlegen', 'Neue Rollen anlegen.', now(), now()),
  (gen_random_uuid(), 'roles.update', 'Rollen bearbeiten', 'Rollen umbenennen oder ihre Beschreibung ändern.', now(), now()),
  (gen_random_uuid(), 'roles.delete', 'Rollen löschen', 'Rollen löschen.', now(), now()),

  (gen_random_uuid(), 'groups.read', 'Gruppen ansehen', 'Gruppen und ihre Mitgliedschaften ansehen.', now(), now()),
  (gen_random_uuid(), 'groups.create', 'Gruppen anlegen', 'Neue Gruppen anlegen.', now(), now()),
  (gen_random_uuid(), 'groups.update', 'Gruppen bearbeiten', 'Gruppen bearbeiten, Rollen-Zuordnungen und Organisationsbereiche der Gruppe ändern.', now(), now()),
  (gen_random_uuid(), 'groups.delete', 'Gruppen löschen', 'Gruppen löschen.', now(), now()),

  (gen_random_uuid(), 'audit.read', 'Protokoll einsehen', 'Das Änderungsprotokoll (Audit-Log) nach Kategorie, Akteur, Zeitraum und Entität durchsuchen.', now(), now())
ON CONFLICT ("key") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Expand grouped old permissions into their new equivalents for every
--    role that held them, then drop the old rows (cascades the now-
--    redundant role_permissions rows for them).
-- ---------------------------------------------------------------------------
CREATE TEMPORARY TABLE "_permission_expansion" ("old_key" TEXT, "new_key" TEXT) ON COMMIT DROP;
INSERT INTO "_permission_expansion" ("old_key", "new_key") VALUES
  ('users.manage', 'users.read'),
  ('users.manage', 'users.create'),
  ('users.manage', 'users.update'),
  ('users.manage', 'users.delete'),

  ('roles.manage', 'roles.read'),
  ('roles.manage', 'roles.create'),
  ('roles.manage', 'roles.update'),
  ('roles.manage', 'roles.delete'),

  ('groups.manage', 'groups.read'),
  ('groups.manage', 'groups.create'),
  ('groups.manage', 'groups.update'),
  ('groups.manage', 'groups.delete'),

  ('organizations.manage', 'organizations.create'),
  ('organizations.manage', 'organizations.update'),
  ('organizations.manage', 'organizations.delete'),

  ('articles.manage', 'articles.create'),
  ('articles.manage', 'articles.update'),
  ('articles.manage', 'articles.delete'),

  -- old inventory.manage covered create/update/delete/retire together (the
  -- retire/change-inventory-number split is new granularity, not something
  -- inventory.manage holders previously lacked).
  ('inventory.manage', 'inventory.create'),
  ('inventory.manage', 'inventory.update'),
  ('inventory.manage', 'inventory.delete'),
  ('inventory.manage', 'inventory.retire'),

  -- old inventory.view was the single shared read-gate for inventory items,
  -- articles, organizations/units, locations/rooms and categories alike.
  ('inventory.view', 'inventory.read'),
  ('inventory.view', 'articles.read'),
  ('inventory.view', 'organizations.read'),
  ('inventory.view', 'locations.read'),

  ('locations.manage', 'locations.create'),
  ('locations.manage', 'locations.update'),
  ('locations.manage', 'locations.delete');

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT DISTINCT rp."role_id", p_new."id", now()
FROM "role_permissions" rp
JOIN "permissions" p_old ON p_old."id" = rp."permission_id"
JOIN "_permission_expansion" m ON m."old_key" = p_old."key"
JOIN "permissions" p_new ON p_new."key" = m."new_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "permissions" WHERE "key" IN (SELECT DISTINCT "old_key" FROM "_permission_expansion");

-- ---------------------------------------------------------------------------
-- 5. Brand-new permissions with no old equivalent: grant to roles that
--    already hold the closest existing high-trust permission, so the
--    people who could effectively already do this (loan admins, the most
--    privileged role-managers) aren't newly blocked by an action that
--    simply didn't require a permission check before.
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT DISTINCT rp."role_id", p_new."id", now()
FROM "role_permissions" rp
JOIN "permissions" p_old ON p_old."id" = rp."permission_id" AND p_old."key" = 'loans.administer'
JOIN "permissions" p_new ON p_new."key" = 'loans.delete'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT DISTINCT rp."role_id", p_new."id", now()
FROM "role_permissions" rp
JOIN "permissions" p_old ON p_old."id" = rp."permission_id" AND p_old."key" = 'permissions.assign'
JOIN "permissions" p_new ON p_new."key" = 'audit.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
