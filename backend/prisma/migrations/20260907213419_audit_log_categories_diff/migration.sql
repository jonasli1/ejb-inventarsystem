-- Audit log overhaul: adds a category (for the new filterable GET /audit
-- endpoint) and before/after snapshot columns (written by the new central
-- AuditInterceptor). Existing rows are backfilled from their entityType so
-- historical entries are searchable by category too, not just new ones.
--
-- NOTE: the "DROP INDEX articles_name_trgm_idx" that `prisma migrate diff`
-- suggests here is a false positive (Prisma doesn't know about that
-- hand-added index) and is intentionally NOT included below.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'login';
ALTER TYPE "AuditAction" ADD VALUE 'login_failed';
ALTER TYPE "AuditAction" ADD VALUE 'logout';

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('auth', 'loan', 'article', 'inventory', 'person', 'group', 'role', 'other');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "after_data" JSONB,
ADD COLUMN     "before_data" JSONB,
ADD COLUMN     "category" "AuditCategory" NOT NULL DEFAULT 'other';

-- CreateIndex
CREATE INDEX "audit_logs_category_created_at_idx" ON "audit_logs"("category", "created_at");

-- Backfill existing rows' category from their entityType.
UPDATE "audit_logs" SET "category" = 'inventory' WHERE "entity_type" = 'InventoryItem';
UPDATE "audit_logs" SET "category" = 'article' WHERE "entity_type" = 'Article';
UPDATE "audit_logs" SET "category" = 'loan' WHERE "entity_type" IN ('Loan', 'LoanBlackoutPeriod', 'LoanTemplate');
UPDATE "audit_logs" SET "category" = 'person' WHERE "entity_type" = 'User';
UPDATE "audit_logs" SET "category" = 'role' WHERE "entity_type" = 'Role';
UPDATE "audit_logs" SET "category" = 'group' WHERE "entity_type" = 'Group';
-- Organization/Location/everything else keeps the 'other' default.
