-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('light', 'dark', 'system');

-- AlterTable
ALTER TABLE "loan_items" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "loan_item_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "theme_preference" "ThemePreference" NOT NULL DEFAULT 'system';

-- CreateTable
CREATE TABLE "group_organization_scopes" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "organization_unit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_organization_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT 'Inventarsystem',
    "church_tools_enabled" BOOLEAN NOT NULL DEFAULT true,
    "passkey_enabled" BOOLEAN NOT NULL DEFAULT true,
    "logo_data" BYTEA,
    "logo_mime_type" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_organization_scopes_organization_id_idx" ON "group_organization_scopes"("organization_id");

-- CreateIndex
CREATE INDEX "group_organization_scopes_organization_unit_id_idx" ON "group_organization_scopes"("organization_unit_id");

-- CreateIndex
-- NULLS NOT DISTINCT (hand-added, Prisma's DSL can't express it): without
-- this, two whole-org (organization_unit_id IS NULL) rows could be inserted
-- for the same group+organization.
CREATE UNIQUE INDEX "group_organization_scopes_group_id_organization_id_organiza_key" ON "group_organization_scopes"("group_id", "organization_id", "organization_unit_id") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "stock_movements_loan_item_id_idx" ON "stock_movements"("loan_item_id");

-- AddForeignKey
ALTER TABLE "group_organization_scopes" ADD CONSTRAINT "group_organization_scopes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_organization_scopes" ADD CONSTRAINT "group_organization_scopes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_organization_scopes" ADD CONSTRAINT "group_organization_scopes_organization_unit_id_fkey" FOREIGN KEY ("organization_unit_id") REFERENCES "organization_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_loan_item_id_fkey" FOREIGN KEY ("loan_item_id") REFERENCES "loan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_items" ADD CONSTRAINT "loan_items_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data backfill: migrate groups.organization_id (1 org per group) into the
-- new many-to-many group_organization_scopes table (as a whole-org scope,
-- organization_unit_id NULL) before the column is dropped below.
INSERT INTO "group_organization_scopes" (id, group_id, organization_id, organization_unit_id, created_at)
SELECT gen_random_uuid(), id, organization_id, NULL, now()
FROM "groups"
WHERE organization_id IS NOT NULL;

-- DropForeignKey
ALTER TABLE "groups" DROP CONSTRAINT "groups_organization_id_fkey";

-- DropIndex
DROP INDEX "groups_organization_id_idx";

-- AlterTable
ALTER TABLE "groups" DROP COLUMN "organization_id";

-- Data backfill: retroactively mark loan items as approved for loans that
-- were already approved/issued/completed before this migration, so the new
-- per-item approval UI doesn't show "0/N genehmigt" for old, already-handled
-- loans. Cosmetic only - issue()/returnLoan() gate on Loan.status, not on
-- this field, so skipping this would not break anything functionally.
UPDATE "loan_items" li
SET approved_at = COALESCE(l.issued_at, l.updated_at),
    approved_by_user_id = l.lent_by_user_id
FROM "loans" l
WHERE li.loan_id = l.id AND l.status IN ('approved', 'issued', 'completed');

-- Data backfill: introduce the loans.spend permission (normally seeded by
-- `prisma db seed`, which routine deploys do NOT re-run - see README "Aktualisieren")
-- and grant it to every role that currently holds loans.manage, so existing
-- approvers don't lose the ability to issue/return loan items the moment
-- loans.spend becomes the dedicated gate for those two actions. Admins can
-- split the permissions apart again afterwards via the Roles UI.
INSERT INTO "permissions" (id, key, description, created_at, updated_at)
SELECT gen_random_uuid(), 'loans.spend',
       'Issue (hand out) and take back loan items for organizations/units the user''s group(s) are scoped to',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE key = 'loans.spend');

INSERT INTO "role_permissions" (role_id, permission_id, created_at)
SELECT rp.role_id, spend.id, now()
FROM "role_permissions" rp
JOIN "permissions" manage ON rp.permission_id = manage.id AND manage.key = 'loans.manage'
CROSS JOIN (SELECT id FROM "permissions" WHERE key = 'loans.spend') spend
ON CONFLICT (role_id, permission_id) DO NOTHING;
