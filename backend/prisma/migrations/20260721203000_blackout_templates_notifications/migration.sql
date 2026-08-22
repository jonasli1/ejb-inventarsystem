-- CreateTable
CREATE TABLE "loan_blackout_periods" (
    "id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_blackout_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_blackout_periods_start_date_end_date_idx" ON "loan_blackout_periods"("start_date", "end_date");

-- AddForeignKey
ALTER TABLE "loan_blackout_periods" ADD CONSTRAINT "loan_blackout_periods_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "loan_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "loan_templates" ADD CONSTRAINT "loan_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "loan_template_items" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "loan_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_template_items_template_id_idx" ON "loan_template_items"("template_id");

-- AddForeignKey
ALTER TABLE "loan_template_items" ADD CONSTRAINT "loan_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "loan_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_template_items" ADD CONSTRAINT "loan_template_items_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "email_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT,
    "port" INTEGER,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "password_enc" TEXT,
    "from_address" TEXT,
    "from_name" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_event_key_key" ON "notification_preferences"("user_id", "event_key");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
