-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "loanable_by_quantity" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "separately_loanable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "subject" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "loan_items" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: give every existing loan a subject derived from its borrower
-- name (falling back to a generic label) so the field reads sensibly for
-- loans created before "Betreff" existed.
UPDATE "loans"
SET "subject" = COALESCE(NULLIF("borrower_name", ''), 'Ausleihe')
WHERE "subject" = '';

-- Backfill: assign a stable sort_order to existing loan items, per loan, in
-- their original creation order.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "loan_id" ORDER BY "created_at") - 1 AS rn
  FROM "loan_items"
)
UPDATE "loan_items" li
SET "sort_order" = ordered.rn
FROM ordered
WHERE li."id" = ordered."id";
