-- CreateEnum
CREATE TYPE "AttachmentEntityType" AS ENUM ('article', 'inventoryItem', 'loanItem');

-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('image', 'document', 'inspection', 'checkoutPhoto', 'returnPhoto');

-- CreateEnum
CREATE TYPE "BackupDestinationType" AS ENUM ('sftp', 'onedrive');

-- CreateEnum
CREATE TYPE "BackupFrequency" AS ENUM ('daily', 'weekly', 'monthly');

-- AlterTable: Group -> Organization
ALTER TABLE "groups" ADD COLUMN     "organization_id" TEXT;

-- CreateIndex
CREATE INDEX "groups_organization_id_idx" ON "groups"("organization_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Loan contact/address fields + issuedAt
ALTER TABLE "loans" ADD COLUMN     "borrower_street" TEXT,
ADD COLUMN     "borrower_city" TEXT,
ADD COLUMN     "borrower_email" TEXT,
ADD COLUMN     "borrower_phone" TEXT,
ADD COLUMN     "issued_at" TIMESTAMP(3);

-- Backfill issuedAt: under the previous model every existing loan was created
-- already checked out (no request/approval phase existed), so checkoutDate
-- doubled as the actual hand-out time.
UPDATE "loans" SET "issued_at" = "checkout_date";

-- LoanStatus enum overhaul: requested/approved/issued/completed replace
-- open/returned/overdue/cancelled. overdue/cancelled were never written by
-- any service code (dead enum values); mapped defensively below anyway.
CREATE TYPE "LoanStatus_new" AS ENUM ('requested', 'approved', 'issued', 'completed');

ALTER TABLE "loans" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "loans" ALTER COLUMN "status" TYPE "LoanStatus_new" USING (
  CASE "status"::text
    WHEN 'open' THEN 'issued'
    WHEN 'overdue' THEN 'issued'
    WHEN 'returned' THEN 'completed'
    WHEN 'cancelled' THEN 'completed'
  END
)::"LoanStatus_new";

ALTER TYPE "LoanStatus" RENAME TO "LoanStatus_old";
ALTER TYPE "LoanStatus_new" RENAME TO "LoanStatus";
DROP TYPE "LoanStatus_old";

ALTER TABLE "loans" ALTER COLUMN "status" SET DEFAULT 'requested';

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "entity_type" "AttachmentEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "category" "AttachmentCategory" NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "backup_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "BackupFrequency" NOT NULL DEFAULT 'weekly',
    "destination_type" "BackupDestinationType",
    "sftp_host" TEXT,
    "sftp_port" INTEGER,
    "sftp_username" TEXT,
    "sftp_password_enc" TEXT,
    "sftp_remote_path" TEXT,
    "onedrive_refresh_token_enc" TEXT,
    "onedrive_folder_path" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_run_status" TEXT,
    "last_run_message" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_config_pkey" PRIMARY KEY ("id")
);
