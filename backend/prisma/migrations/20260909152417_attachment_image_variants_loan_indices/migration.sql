-- Image variants (thumbnail/medium) for attachments, generated at upload
-- time for image categories only - existing rows simply have both columns
-- NULL until re-uploaded (nothing retroactively backfills old images).
-- Plus a few missing indexes on Loan's common list/filter columns.
--
-- NOTE: the "DROP INDEX articles_name_trgm_idx" that `prisma migrate diff`
-- suggests here is a false positive (Prisma doesn't know about that
-- hand-added index) and is intentionally NOT included below.

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "medium_key" TEXT,
ADD COLUMN     "thumbnail_key" TEXT;

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "loans_lent_by_user_id_idx" ON "loans"("lent_by_user_id");

-- CreateIndex
CREATE INDEX "loans_borrower_person_id_idx" ON "loans"("borrower_person_id");
