-- Site-wide, admin-editable HTML footer appended to every outgoing
-- notification email (falls back to a built-in default text when unset).
--
-- NOTE: the "DROP INDEX articles_name_trgm_idx" that `prisma migrate diff`
-- suggests here is a false positive (Prisma doesn't know about that
-- hand-added index) and is intentionally NOT included below.

-- AlterTable
ALTER TABLE "email_config" ADD COLUMN     "footer_html" TEXT;
