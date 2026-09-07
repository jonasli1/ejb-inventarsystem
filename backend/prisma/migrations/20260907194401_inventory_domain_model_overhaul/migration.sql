-- Object types (UNIQUE/BULK/CONSUMABLE) are removed: every physical unit is
-- now just an InventoryItem with a discrete status, as the old BULK type
-- already behaved. condition_percent (only ever meaningful for CONSUMABLE)
-- goes with it.
--
-- DropIndex
DROP INDEX "inventory_items_inventory_number_key";

-- AlterTable
ALTER TABLE "articles" DROP COLUMN "type",
ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "inventory_items" DROP COLUMN "condition_percent",
ADD COLUMN     "next_dguv_v3_check" TIMESTAMP(3),
ADD COLUMN     "parent_item_id" TEXT,
ALTER COLUMN "inventory_number" DROP NOT NULL;

-- DropEnum
DROP TYPE "ArticleType";

-- CreateIndex
CREATE INDEX "inventory_items_status_idx" ON "inventory_items"("status");

-- CreateIndex
CREATE INDEX "inventory_items_parent_item_id_idx" ON "inventory_items"("parent_item_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Inventory number: case-insensitive uniqueness only among non-retired
-- items, freed up again once an item is retired. This is a partial +
-- functional (lower()) unique index, which Prisma's schema DSL can't
-- express, so it's hand-added here (same pattern as the NULLS NOT DISTINCT
-- constraint on group_organization_scopes in an earlier migration).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "inventory_items_inventory_number_active_key"
  ON "inventory_items" (lower("inventory_number"))
  WHERE "status" <> 'retired' AND "inventory_number" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Optional: performant synonym/alias search via pg_trgm. Not required for
-- correctness (ArticlesService also falls back to a plain ILIKE/unnest scan
-- on "aliases" for exact substring matches) - this just makes fuzzy/typo-
-- tolerant search over name + aliases fast at scale. Safe to skip if the
-- database user lacks CREATE EXTENSION privileges; the app works without it.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "articles_name_trgm_idx"
  ON "articles" USING gin ("name" gin_trgm_ops);

-- gin_trgm_ops needs a scalar, so the array is flattened to a
-- space-joined string first; ArticlesService's optional trigram search path
-- mirrors this exact expression so the planner can use the index. Postgres
-- refuses to index built-in array_to_string() directly (only marked STABLE,
-- not IMMUTABLE) - wrap it in a trivial IMMUTABLE SQL function instead.
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text)
  RETURNS text AS $$ SELECT array_to_string($1, $2) $$
  LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE INDEX IF NOT EXISTS "articles_aliases_trgm_idx"
  ON "articles" USING gin (immutable_array_to_string("aliases", ' ') gin_trgm_ops);
