-- Data-only backfill, no schema change.
--
-- NOTE: the "DROP INDEX articles_name_trgm_idx" that `prisma migrate diff`
-- suggests here is a false positive (Prisma doesn't know about that
-- hand-added index) and is intentionally NOT included below - see the
-- other migrations in this repo carrying the same note.
--
-- Before the loan-delete status-reversion fix (backend/src/loans/
-- loans.service.ts#remove), deleting an issued loan left its still-borrowed
-- items stuck on "borrowed" forever, with the loan (and its loan_items)
-- gone. This retroactively finds every inventory item still on "borrowed"
-- with no active (issued, unreturned) loan actually claiming it, and
-- reverts each to whatever status it held right before it was last marked
-- borrowed - looked up from that item's own status_change history, falling
-- back to "available" if none is found. Mirrors remove()'s own logic
-- exactly, just as a one-time backfill instead of per-delete.
--
-- Two independent statements (not a temp table shared across them): Prisma
-- 7's migration engine no longer runs an entire migration.sql inside one
-- transaction (see the granular_permissions migration's own note), so both
-- statements recompute the same "orphaned item -> revert status" mapping
-- from scratch rather than relying on state produced by the other.

-- 1. Log a status_change movement for each orphaned item BEFORE its status
--    changes below, while the WHERE clause below can still find it via
--    status = 'borrowed'.
INSERT INTO "stock_movements" ("id", "inventory_item_id", "type", "old_status", "new_status", "note", "created_at")
SELECT
  gen_random_uuid(),
  ii."id",
  'status_change',
  'borrowed',
  COALESCE(lm."old_status", 'available'),
  'Status zurückgesetzt (verwaiste Ausleihe - Datenmigration)',
  now()
FROM "inventory_items" ii
LEFT JOIN LATERAL (
  SELECT sm."old_status"
  FROM "stock_movements" sm
  WHERE sm."inventory_item_id" = ii."id"
    AND sm."type" = 'status_change'
    AND sm."new_status" = 'borrowed'
  ORDER BY sm."created_at" DESC
  LIMIT 1
) lm ON true
WHERE ii."status" = 'borrowed'
  AND NOT EXISTS (
    SELECT 1 FROM "loan_items" li
    JOIN "loans" l ON l."id" = li."loan_id"
    WHERE li."inventory_item_id" = ii."id"
      AND li."returned_at" IS NULL
      AND l."status" = 'issued'
  );

-- 2. Now actually revert the status, using the identical (independently
--    recomputed) selection and fallback.
UPDATE "inventory_items" ii
SET "status" = COALESCE(lm."old_status", 'available')
FROM (
  SELECT
    ii2."id",
    (
      SELECT sm."old_status"
      FROM "stock_movements" sm
      WHERE sm."inventory_item_id" = ii2."id"
        AND sm."type" = 'status_change'
        AND sm."new_status" = 'borrowed'
      ORDER BY sm."created_at" DESC
      LIMIT 1
    ) AS "old_status"
  FROM "inventory_items" ii2
  WHERE ii2."status" = 'borrowed'
    AND NOT EXISTS (
      SELECT 1 FROM "loan_items" li
      JOIN "loans" l ON l."id" = li."loan_id"
      WHERE li."inventory_item_id" = ii2."id"
        AND li."returned_at" IS NULL
        AND l."status" = 'issued'
    )
) lm
WHERE ii."id" = lm."id";
