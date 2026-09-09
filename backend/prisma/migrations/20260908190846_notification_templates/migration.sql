-- Admin-editable per-event email subject/HTML body (see
-- notification-events.ts). Purely additive - no row means "use the
-- built-in German default", so existing behavior is unaffected until an
-- admin explicitly customizes a template via PUT /notifications/templates/:eventKey.
--
-- NOTE: the "DROP INDEX articles_name_trgm_idx" that `prisma migrate diff`
-- suggests here is a false positive (Prisma doesn't know about that
-- hand-added index) and is intentionally NOT included below.

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_event_key_key" ON "notification_templates"("event_key");
