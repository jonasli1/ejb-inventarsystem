-- NOTE: the "DROP INDEX articles_name_trgm_idx" that `prisma migrate diff`
-- suggests here is a false positive (Prisma doesn't know about that
-- hand-added index) and is intentionally NOT included below - see the
-- other migrations in this repo carrying the same note.

-- Natural (numeric-aware) sort for inventory_number: without this, a plain
-- string ORDER BY puts "Adam-10" before "Adam-5" (comparing '1' < '5'
-- character-by-character). Postgres's ICU collations support a "numeric
-- ordering" mode (BCP-47 -u-kn-true) that compares embedded digit runs by
-- value instead - exactly "Adam-5, Adam-8, Adam-10, Bernd-5, Bernhard-2".
-- Prisma has no schema DSL for collations, so this (and the index below,
-- which Prisma's own diff would otherwise recreate without it) is hand-
-- written; verified against a fresh node:postgres-16-alpine-matching local
-- database that ICU support is compiled in and this collation loads.
CREATE COLLATION "natural_sort" (provider = icu, locale = 'und-u-kn-true');
ALTER TABLE "inventory_items" ALTER COLUMN "inventory_number" TYPE text COLLATE "natural_sort";

-- CreateIndex
CREATE INDEX "inventory_items_inventory_number_id_idx" ON "inventory_items"("inventory_number", "id");
